import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { emailNovoLead, emailNovoLeadBloqueado } from '@/lib/email'
import { sendWhatsApp } from '@/lib/whatsapp'
import { isPersonalLinkQuotaExhausted } from '@/lib/personal-link-limits'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { lead_id } = await req.json()

    const { data: lead } = await supabaseAdmin
      .from('leads')
      .select('*, professionals(name, email, phone, specialty, plan, zone)')
      .eq('id', lead_id)
      .single()

    if (!lead || !lead.professionals?.email) return NextResponse.json({ ok: false })

    const prof = lead.professionals
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://façoporti.com'

    // Bloqueado = plano free (nunca abre nenhum lead) OU marketplace sem
    // créditos (lead.locked) OU lead do link pessoal cuja quota do ciclo já
    // está esgotada (abri-lo agora não seria autorizado, por isso a
    // notificação também não pode revelar os dados). Verificação no
    // servidor — nunca confiar só na UI.
    const isFreePlan = !prof.plan || prof.plan === 'free'
    const quotaExhausted = !isFreePlan && lead.source !== 'marketplace' && !lead.opened_at
      ? await isPersonalLinkQuotaExhausted(lead.professional_id)
      : false
    const isBlocked = isFreePlan || !!lead.locked || quotaExhausted

    if (isBlocked) {
      await emailNovoLeadBloqueado({
        profName: prof.name,
        profEmail: prof.email,
        profSpecialty: prof.specialty,
        zoneApprox: lead.zone_requested || prof.zone || null,
        isFreePlan,
      })

      if (prof.phone) {
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
    })

    // WhatsApp ao profissional
    if (prof.phone) {
      const result = await sendWhatsApp(prof.phone,
        `🔔 *Novo pedido de orçamento!*\n\n` +
        `👤 *Cliente:* ${lead.name || '—'}\n` +
        `📱 *Telefone:* ${lead.phone || '—'}\n` +
        `🔧 *Serviço:* ${servico}\n\n` +
        `Ver detalhes: ${appUrl}/leads/${lead.id}`
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
