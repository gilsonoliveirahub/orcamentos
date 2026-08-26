import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { recordRequestCompleted, clientIpFrom, sanitizeUtm, extractHostname, normalizeOriginChannel } from '@/lib/analytics'
import { computeClientConsentFields, upsertClientMarketingConsent } from '@/lib/marketing-consent'
import { geocodeZone } from '@/lib/geo'

export const dynamic = 'force-dynamic'

// Sem atribuição automática (removida em 2026-07-16 — decisão confirmada).
// Todo lead do marketplace nasce sem dono (professional_id null) e fica
// visível na área Marketplace do dashboard para profissionais compatíveis
// (mesma especialidade, ~50km). Só passa a ter professional_id quando um
// profissional o adquire ativamente com 1 crédito (ver lib/marketplace.ts).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { specialty, zone_requested, marketing_opt_in, referrer, utm_source, utm_medium, utm_campaign, ...fields } = body
    // consent_version/consent_source nunca vêm do cliente — só o booleano da
    // checkbox; esta rota é usada por /pedir, por isso a origem é sempre 'pedir'.
    const consentFields = computeClientConsentFields(marketing_opt_in, 'pedir')

    // Coordenadas aproximadas da zona pedida, para a correspondência por
    // distância na área Marketplace. Null se a zona não for reconhecida —
    // nesse caso o fallback por texto de zona continua a aplicar-se.
    const coords = geocodeZone(zone_requested)

    const { data: lead, error } = await supabaseAdmin
      .from('leads')
      .insert({
        ...fields,
        professional_id: null,
        specialty,
        zone_requested: zone_requested || null,
        source: 'marketplace',
        locked: true,
        status: 'pendente',
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        ...consentFields,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    // O contacto relacionado com o orçamento pedido nunca depende disto —
    // isto só atualiza a fonte de verdade de consentimento por email para
    // eventuais campanhas futuras (que ainda não existem).
    await upsertClientMarketingConsent({ email: fields.email, leadId: lead.id, fields: consentFields })

    // Mesma atribuição de campanha já capturada no page_view/request_started
    // desta visita (lib/track-client.ts) — repetida aqui porque o pedido
    // concluído é um evento server-side à parte, não gravado pelo browser.
    const referrerDomain = typeof referrer === 'string' ? extractHostname(referrer) : null
    const utmSourceClean = sanitizeUtm(typeof utm_source === 'string' ? utm_source : null)
    const utmMediumClean = sanitizeUtm(typeof utm_medium === 'string' ? utm_medium : null)
    const utmCampaignClean = sanitizeUtm(typeof utm_campaign === 'string' ? utm_campaign : null)

    // Sem profissional atribuído na criação — conta nas métricas globais da
    // plataforma, nunca nas métricas de nenhum profissional específico.
    await recordRequestCompleted({
      ip: clientIpFrom(req.headers),
      userAgent: req.headers.get('user-agent') || '',
      professionalId: null,
      source: 'marketplace',
      path: '/pedir',
      referrerDomain,
      utmSource: utmSourceClean,
      utmMedium: utmMediumClean,
      utmCampaign: utmCampaignClean,
      originChannel: normalizeOriginChannel(referrerDomain, utmSourceClean),
    })

    return NextResponse.json({ lead, assigned: false })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
