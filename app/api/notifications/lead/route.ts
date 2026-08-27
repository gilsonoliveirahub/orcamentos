import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { emailNovoLead, emailNovoLeadBloqueado } from '@/lib/email'
import { sendWhatsApp } from '@/lib/whatsapp'
import { isLeadAuthorized } from '@/lib/lead-authorization'
import { getEffectivePlan, isPaidEffective } from '@/lib/effective-plan'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { lead_id } = await req.json()

    const { data: lead } = await supabaseAdmin
      .from('leads')
      .select('*, professionals(name, email, phone, specialty, plan, trial_ends_at, zone)')
      .eq('id', lead_id)
      .single()

    if (!lead || !lead.professionals?.email) return NextResponse.json({ ok: false })

    const prof = lead.professionals
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://façoporti.com'

    // Usa a mesma regra oficial de autorização que o resto do sistema
    // (dashboard, /api/leads/open, /api/leads/status): só revela dados de
    // contacto depois do lead estar realmente aberto (link pessoal) ou
    // adquirido (marketplace). Nunca reimplementar esta condição aqui.
    // isFreePlan decide só o CTA/copy do email/WhatsApp de lead bloqueado
    // ("ativa o teu plano" vs "desbloqueia no dashboard") — fonte de verdade
    // única (lib/effective-plan.ts): trial ativo conta como Starter (mesmo
    // CTA que um pago), inactive volta a contar como não-pago.
    const isFreePlan = !isPaidEffective(getEffectivePlan(prof))
    // Notificações por WhatsApp são exclusivas do plano Pro (decisão de
    // negócio) — email continua para todos os planos pagos/free consoante
    // as regras já existentes, isto só gate o canal WhatsApp. Trial nunca
    // conta como Pro.
    const isPro = prof.plan === 'pro'
    const authorized = isLeadAuthorized(lead)

    if (!authorized) {
      await emailNovoLeadBloqueado({
        profName: prof.name,
        profEmail: prof.email,
        profSpecialty: prof.specialty,
        zoneApprox: lead.zone_requested || prof.zone || null,
        isFreePlan,
      })

      if (prof.phone && isPro) {
        const ctaUrl = isFreePlan ? `${appUrl}/upgrade` : `${appUrl}/dashboard`
        const result = await sendWhatsApp(prof.phone,
          `🔒 *Novo pedido de orçamento!*\n\n` +
          `🔧 *Especialidade:* ${prof.specialty}\n\n` +
          `${isFreePlan ? 'Ativa o teu plano' : 'Desbloqueia'} para ver os detalhes: ${ctaUrl}`
        )
        if (result.status !== 'sent') {
          console.warn(`[notifications/lead] WhatsApp (bloqueado) não enviado (lead ${lead.id}): ${result.reason}`)
        }
      }

      return NextResponse.json({ ok: true, blocked: true })
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

    // WhatsApp ao profissional — exclusivo do plano Pro (decisão de negócio)
    if (prof.phone && isPro) {
      const result = await sendWhatsApp(prof.phone,
        `🔔 *Novo pedido de orçamento!*\n\n` +
        `👤 *Cliente:* ${lead.name || '—'}\n` +
        `📱 *Telefone:* ${lead.phone || '—'}\n` +
        `🔧 *Serviço:* ${servico}\n` +
        (mediaCount > 0 ? `📷 *Fotos/vídeos:* ${mediaCount} anexado${mediaCount === 1 ? '' : 's'}\n` : '') +
        `\nVer detalhes: ${appUrl}/leads/${lead.id}`
      )
      if (result.status !== 'sent') {
        console.warn(`[notifications/lead] WhatsApp não enviado (lead ${lead.id}): ${result.reason}`)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
