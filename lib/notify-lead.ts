import { supabaseAdmin } from '@/lib/supabase-admin'
import { emailNovoLead, emailNovoLeadBloqueado } from '@/lib/email'
import { sendWhatsApp } from '@/lib/whatsapp'
import { isLeadAuthorized } from '@/lib/lead-authorization'
import { getEffectivePlan, isPaidEffective } from '@/lib/effective-plan'

// P0 (2026-09-18): lógica extraída de app/api/notifications/lead/route.ts
// para poder ser chamada diretamente (await, em processo) a partir de
// qualquer rota que crie um lead, em vez de um `fetch` à própria API —
// que era o fire-and-forget sem `await` que fazia a notificação do link
// pessoal (/p/[slug]) nunca chegar a disparar quando o browser fechava ou
// perdia rede logo depois de mostrar "pedido enviado". A rota
// app/api/notifications/lead/route.ts continua a existir (usada por
// lib/marketplace.ts e por qualquer chamada externa/manual), agora como um
// wrapper fino sobre esta função.
//
// Antes disto, uma falha de envio (email ou WhatsApp) ficava só num
// console.warn/console.error — nunca visível para o profissional nem
// persistida. Foi assim que o domínio de email ficou meses sem verificação
// na Resend sem ninguém dar por isso (lead da Elisa Reuter, 2026-09-16).
// Esta função nunca lança — uma falha ao registar o log não pode impedir a
// notificação seguinte nem a resposta de quem a chamou.
async function logNotification(params: {
  leadId: string
  professionalId: string | null
  channel: 'email' | 'whatsapp'
  status: 'sent' | 'failed' | 'skipped'
  reason?: string | null
}) {
  const { error } = await supabaseAdmin.from('notification_log').insert({
    lead_id: params.leadId,
    professional_id: params.professionalId,
    channel: params.channel,
    status: params.status,
    reason: params.reason ?? null,
  })
  if (error) console.error(`[notify-lead] falha ao registar notification_log: ${error.message}`)
}

// P0 (2026-09-18): "enviar no máximo uma notificação por canal para o mesmo
// lead" — antes disto não havia nenhuma verificação, um retry (rede, clique
// duplo no cliente antes desta função existir, ou uma futura repetição
// manual) reenviava sempre email/WhatsApp sem olhar para o que já tinha sido
// feito. Só conta como "já enviado" um registo com status='sent' — uma
// tentativa anterior 'failed' não impede uma nova tentativa.
async function hasAlreadySent(leadId: string, channel: 'email' | 'whatsapp'): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('notification_log')
    .select('channel')
    .eq('lead_id', leadId)
    .eq('status', 'sent')
  return Array.isArray(data) && data.some((row: { channel?: string }) => row.channel === channel)
}

export type NotifyLeadResult = { ok: boolean; blocked?: boolean }

export async function notifyLeadCreated(leadId: string): Promise<NotifyLeadResult> {
  const { data: lead } = await supabaseAdmin
    .from('leads')
    .select('*, professionals(name, email, phone, specialty, plan, trial_ends_at, zone)')
    .eq('id', leadId)
    .single()

  if (!lead || !lead.professionals?.email) return { ok: false }

  const prof = lead.professionals
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://façoporti.com'

  // Usa a mesma regra oficial de autorização que o resto do sistema
  // (dashboard, /api/leads/open, /api/leads/status): só revela dados de
  // contacto depois do lead estar realmente aberto (link pessoal) ou
  // adquirido (marketplace). Nunca reimplementar esta condição aqui.
  const isFreePlan = !isPaidEffective(getEffectivePlan(prof))
  // Notificações por WhatsApp são exclusivas do plano Pro (decisão de
  // negócio) — email continua para todos os planos pagos/free consoante as
  // regras já existentes, isto só gate o canal WhatsApp. Trial nunca conta
  // como Pro.
  const isPro = prof.plan === 'pro'
  const authorized = isLeadAuthorized(lead)

  if (!authorized) {
    if (!(await hasAlreadySent(lead.id, 'email'))) {
      try {
        await emailNovoLeadBloqueado({
          profName: prof.name,
          profEmail: prof.email,
          profSpecialty: prof.specialty,
          zoneApprox: lead.zone_requested || prof.zone || null,
          isFreePlan,
        })
        await logNotification({ leadId: lead.id, professionalId: lead.professional_id, channel: 'email', status: 'sent' })
      } catch (err: any) {
        console.error(`[notify-lead] email (bloqueado) não enviado (lead ${lead.id}): ${err.message}`)
        await logNotification({ leadId: lead.id, professionalId: lead.professional_id, channel: 'email', status: 'failed', reason: err.message })
      }
    }

    if (prof.phone && isPro && !(await hasAlreadySent(lead.id, 'whatsapp'))) {
      const ctaUrl = isFreePlan ? `${appUrl}/upgrade` : `${appUrl}/dashboard`
      const result = await sendWhatsApp(prof.phone,
        `🔒 *Novo pedido de orçamento!*\n\n` +
        `🔧 *Especialidade:* ${prof.specialty}\n\n` +
        `${isFreePlan ? 'Ativa o teu plano' : 'Desbloqueia'} para ver os detalhes: ${ctaUrl}`
      )
      if (result.status !== 'sent') {
        console.warn(`[notify-lead] WhatsApp (bloqueado) não enviado (lead ${lead.id}): ${result.reason}`)
      }
      await logNotification({ leadId: lead.id, professionalId: lead.professional_id, channel: 'whatsapp', status: result.status, reason: result.status === 'sent' ? null : result.reason })
    }

    return { ok: true, blocked: true }
  }

  const metadata = lead.metadata || {}
  const servico = metadata.tipo_trabalho
    ? (Array.isArray(metadata.tipo_trabalho) ? metadata.tipo_trabalho.join(', ') : metadata.tipo_trabalho)
    : lead.q1_tipo_trabalho || prof.specialty || '—'
  const area = metadata.area_m2 || lead.q3_area_m2
  const prazo = metadata.prazo || lead.q9_prazo || '—'
  const notas = metadata.notas || lead.q12_notas || ''
  const mediaCount = Array.isArray(metadata.media_urls) ? metadata.media_urls.length : 0

  const extraRows = Object.entries(metadata)
    .filter(([k, v]) => v && !['tipo_trabalho', 'area_m2', 'prazo', 'notas', 'media_urls'].includes(k))
    .map(([k, v]) => {
      const label = k.replace(/_/g, ' ')
      const val = Array.isArray(v) ? v.join(', ') : String(v)
      return `<tr><td style="padding:8px;color:#64748b;font-size:13px;text-transform:capitalize">${label}</td><td style="padding:8px;color:#fff">${val}</td></tr>`
    }).join('')

  if (!(await hasAlreadySent(lead.id, 'email'))) {
    try {
      await emailNovoLead({
        profName: prof.name,
        profEmail: prof.email,
        profSpecialty: prof.specialty,
        leadId: lead.id,
        leadName: lead.name || '—',
        leadPhone: lead.phone || '—',
        leadEmail: lead.email,
        servico,
        area: area ? String(area) : undefined,
        prazo,
        notas,
        source: lead.source || 'pessoal',
        extraRows,
        mediaCount,
      })
      await logNotification({ leadId: lead.id, professionalId: lead.professional_id, channel: 'email', status: 'sent' })
    } catch (err: any) {
      console.error(`[notify-lead] email não enviado (lead ${lead.id}): ${err.message}`)
      await logNotification({ leadId: lead.id, professionalId: lead.professional_id, channel: 'email', status: 'failed', reason: err.message })
    }
  }

  // WhatsApp ao profissional — exclusivo do plano Pro (decisão de negócio)
  if (prof.phone && isPro && !(await hasAlreadySent(lead.id, 'whatsapp'))) {
    const result = await sendWhatsApp(prof.phone,
      `🔔 *Novo pedido de orçamento!*\n\n` +
      `👤 *Cliente:* ${lead.name || '—'}\n` +
      `📱 *Telefone:* ${lead.phone || '—'}\n` +
      `🔧 *Serviço:* ${servico}\n` +
      (mediaCount > 0 ? `📷 *Fotos/vídeos:* ${mediaCount} anexado${mediaCount === 1 ? '' : 's'}\n` : '') +
      `\nVer detalhes: ${appUrl}/leads/${lead.id}`
    )
    if (result.status !== 'sent') {
      console.warn(`[notify-lead] WhatsApp não enviado (lead ${lead.id}): ${result.reason}`)
    }
    await logNotification({ leadId: lead.id, professionalId: lead.professional_id, channel: 'whatsapp', status: result.status, reason: result.status === 'sent' ? null : result.reason })
  }

  return { ok: true }
}
