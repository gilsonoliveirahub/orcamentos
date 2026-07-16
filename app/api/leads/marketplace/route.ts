import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { recordRequestCompleted, clientIpFrom } from '@/lib/analytics'
import { computeClientConsentFields, upsertClientMarketingConsent } from '@/lib/marketing-consent'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { specialty, zone_requested, marketing_opt_in, ...fields } = body
    // consent_version/consent_source nunca vêm do cliente — só o booleano da
    // checkbox; esta rota é usada por /pedir, por isso a origem é sempre 'pedir'.
    const consentFields = computeClientConsentFields(marketing_opt_in, 'pedir')

    // Encontrar melhor profissional: mesma especialidade + zona, depois só especialidade
    let professional = null

    if (zone_requested) {
      const { data } = await supabaseAdmin
        .from('professionals')
        .select('id, marketplace_credits')
        .eq('specialty', specialty)
        .eq('active', true)
        .ilike('zone', `%${zone_requested}%`)
        .in('plan', ['starter', 'pro'])
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      professional = data
    }

    if (!professional) {
      const { data } = await supabaseAdmin
        .from('professionals')
        .select('id, marketplace_credits')
        .eq('specialty', specialty)
        .eq('active', true)
        .in('plan', ['starter', 'pro'])
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      professional = data
    }

    // Atomic decrement: só actualiza se marketplace_credits ainda for o valor lido (optimistic lock)
    let hasCredits = false
    if (professional && (professional.marketplace_credits ?? 0) > 0) {
      const { data: deducted } = await supabaseAdmin
        .from('professionals')
        .update({ marketplace_credits: professional.marketplace_credits - 1 })
        .eq('id', professional.id)
        .eq('marketplace_credits', professional.marketplace_credits)
        .select('id')
        .maybeSingle()
      hasCredits = !!deducted
    }
    const locked = professional ? !hasCredits : false

    const { data: lead, error } = await supabaseAdmin
      .from('leads')
      .insert({
        ...fields,
        professional_id: professional?.id ?? null,
        specialty,
        zone_requested: zone_requested || null,
        source: 'marketplace',
        locked,
        status: professional ? 'novo' : 'pendente',
        ...consentFields,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    // O contacto relacionado com o orçamento pedido nunca depende disto —
    // isto só atualiza a fonte de verdade de consentimento por email para
    // eventuais campanhas futuras (que ainda não existem).
    await upsertClientMarketingConsent({ email: fields.email, leadId: lead.id, fields: consentFields })

    // Notificar profissional se atribuído
    if (professional && lead) {
      fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'https://façoporti.com'}/api/notifications/lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: lead.id }),
      }).catch(() => {})
    }

    // Sem profissional atribuído: professional_id fica null — conta nas
    // métricas globais da plataforma, mas não entra nas métricas de nenhum
    // profissional específico (decisão confirmada 2026-07-16).
    await recordRequestCompleted({
      ip: clientIpFrom(req.headers),
      userAgent: req.headers.get('user-agent') || '',
      professionalId: professional?.id ?? null,
      source: 'marketplace',
      path: '/pedir',
    })

    return NextResponse.json({ lead, assigned: !!professional })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
