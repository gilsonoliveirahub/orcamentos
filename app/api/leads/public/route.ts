import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { recordRequestCompleted, clientIpFrom, sanitizeUtm, extractHostname, normalizeOriginChannel } from '@/lib/analytics'
import { computeClientConsentFields, upsertClientMarketingConsent } from '@/lib/marketing-consent'
import { notifyLeadCreated } from '@/lib/notify-lead'

export const dynamic = 'force-dynamic'

// Código Postgres para violação de constraint UNIQUE (usado abaixo para
// distinguir "duas submissões em corrida pela mesma idempotency_key" de
// qualquer outro erro de escrita real).
const UNIQUE_VIOLATION = '23505'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { professional_id, source, marketing_opt_in, referrer, utm_source, utm_medium, utm_campaign, idempotency_key, ...fields } = body

    // P0 (2026-09-18): proteção idempotente contra duplo clique, retry de
    // rede ou repetição da mesma requisição — o cliente (ProfessionalProfileClient.tsx)
    // gera uma chave única por submissão e reenvia sempre a mesma em caso de
    // nova tentativa. Se já existir um lead com esta chave, devolve-o
    // diretamente em vez de criar um segundo (a notificação já foi disparada
    // na primeira vez, não é repetida aqui).
    if (typeof idempotency_key === 'string' && idempotency_key) {
      const { data: existing } = await supabaseAdmin
        .from('leads')
        .select()
        .eq('idempotency_key', idempotency_key)
        .maybeSingle()
      if (existing) return NextResponse.json({ lead: existing })
    }

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
      .insert({
        ...fields,
        professional_id,
        source: source || 'pessoal',
        locked,
        ...(idempotency_key ? { idempotency_key } : {}),
        ...consentFields,
      })
      .select()
      .single()

    if (error) {
      // Duas submissões com a mesma chave chegaram a correr em paralelo
      // (ex: duplo clique muito rápido) — a segunda perde a corrida do
      // INSERT, mas o lead já existe: devolve-o em vez de um erro 400.
      if (error.code === UNIQUE_VIOLATION && idempotency_key) {
        const { data: existing } = await supabaseAdmin
          .from('leads')
          .select()
          .eq('idempotency_key', idempotency_key)
          .maybeSingle()
        if (existing) return NextResponse.json({ lead: existing })
      }
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

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

    // Aguardado (não fire-and-forget): em ambiente serverless a função pode
    // ser terminada assim que a resposta é devolvida, o que cancelaria uma
    // promessa não aguardada antes de gravar o evento.
    await recordRequestCompleted({
      ip: clientIpFrom(req.headers),
      userAgent: req.headers.get('user-agent') || '',
      professionalId: professional_id,
      source: isMarketplace ? 'marketplace' : 'pessoal',
      path: '/p/[slug]',
      referrerDomain,
      utmSource: utmSourceClean,
      utmMedium: utmMediumClean,
      utmCampaign: utmCampaignClean,
      originChannel: normalizeOriginChannel(referrerDomain, utmSourceClean),
    })

    // P0 (2026-09-18): a notificação do link pessoal deixou de ser um
    // `fetch('/api/notifications/lead')` sem `await` disparado no cliente
    // logo antes de mostrar "pedido enviado" — se o browser fechasse ou
    // perdesse rede nesse instante, a notificação nunca chegava a sair, sem
    // qualquer aviso. Chamada agora diretamente aqui, no servidor, dentro do
    // mesmo pedido que cria o lead — só falha se o próprio envio falhar
    // (registado em notification_log por notifyLeadCreated), nunca por o
    // browser do cliente ter continuado ou não.
    try {
      await notifyLeadCreated(lead.id)
    } catch (err: any) {
      console.error(`[leads/public] notificação falhou (lead ${lead.id}): ${err.message}`)
    }

    return NextResponse.json({ lead })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
