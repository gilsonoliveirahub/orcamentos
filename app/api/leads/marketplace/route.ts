import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { recordRequestCompleted, clientIpFrom } from '@/lib/analytics'
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
    const { specialty, zone_requested, marketing_opt_in, ...fields } = body
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

    // Sem profissional atribuído na criação — conta nas métricas globais da
    // plataforma, nunca nas métricas de nenhum profissional específico.
    await recordRequestCompleted({
      ip: clientIpFrom(req.headers),
      userAgent: req.headers.get('user-agent') || '',
      professionalId: null,
      source: 'marketplace',
      path: '/pedir',
    })

    return NextResponse.json({ lead, assigned: false })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
