import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { recordRequestCompleted, clientIpFrom } from '@/lib/analytics'
import { computeClientConsentFields, upsertClientMarketingConsent } from '@/lib/marketing-consent'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { professional_id, source, marketing_opt_in, ...fields } = body
    // consent_version/consent_source nunca vêm do cliente — só o booleano da
    // checkbox; a versão e a origem ('p_slug', esta rota é usada por /p/[slug])
    // são sempre definidas aqui, no servidor.
    const consentFields = computeClientConsentFields(marketing_opt_in, 'p_slug')

    const { data: prof } = await supabaseAdmin
      .from('professionals')
      .select('id, marketplace_credits')
      .eq('id', professional_id)
      .single()

    if (!prof) return NextResponse.json({ error: 'Profissional não encontrado' }, { status: 404 })

    // Lead do marketplace — atomic decrement para evitar race condition
    const isMarketplace = source === 'marketplace'
    let hasCredits = false
    if (isMarketplace && (prof.marketplace_credits ?? 0) > 0) {
      const { data: deducted } = await supabaseAdmin
        .from('professionals')
        .update({ marketplace_credits: prof.marketplace_credits - 1 })
        .eq('id', professional_id)
        .eq('marketplace_credits', prof.marketplace_credits)
        .select('id')
        .maybeSingle()
      hasCredits = !!deducted
    }
    const locked = isMarketplace && !hasCredits

    const { data: lead, error } = await supabaseAdmin
      .from('leads')
      .insert({ ...fields, professional_id, source: source || 'pessoal', locked, ...consentFields })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    // O contacto relacionado com o orçamento pedido nunca depende disto —
    // isto só atualiza a fonte de verdade de consentimento por email para
    // eventuais campanhas futuras (que ainda não existem).
    await upsertClientMarketingConsent({ email: fields.email, leadId: lead.id, fields: consentFields })

    // Aguardado (não fire-and-forget): em ambiente serverless a função pode
    // ser terminada assim que a resposta é devolvida, o que cancelaria uma
    // promessa não aguardada antes de gravar o evento.
    await recordRequestCompleted({
      ip: clientIpFrom(req.headers),
      userAgent: req.headers.get('user-agent') || '',
      professionalId: professional_id,
      source: isMarketplace ? 'marketplace' : 'pessoal',
      path: '/p/[slug]',
    })

    return NextResponse.json({ lead })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
