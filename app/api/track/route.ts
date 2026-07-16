export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import {
  EVENT_TYPES,
  SERVER_ONLY_EVENT_TYPES,
  SOURCES,
  isAllowedPath,
  isKnownBot,
  hashVisitor,
  sanitizeUtm,
  extractHostname,
  normalizeOriginChannel,
  clientIpFrom,
  type AnalyticsEventType,
} from '@/lib/analytics'

// Nenhum outro campo é aceite — nunca metadata livre, nunca nome/email/telefone/mensagem.
const ALLOWED_FIELDS = new Set([
  'event_type', 'path', 'professional_slug', 'source', 'referrer',
  'utm_source', 'utm_medium', 'utm_campaign',
])

const ALLOWED_HOSTS = new Set([
  'façoporti.com', 'www.façoporti.com',
  'xn--faoporti-t0a.com', 'www.xn--faoporti-t0a.com',
  'localhost',
])

const RATE_LIMIT_WINDOW_SECONDS = 30
const RATE_LIMIT_MAX_EVENTS = 20

export async function POST(req: NextRequest) {
  try {
    const secret = process.env.ANALYTICS_HASH_SECRET
    if (!secret) {
      console.error('[api/track] ANALYTICS_HASH_SECRET em falta — evento ignorado')
      return NextResponse.json({ success: true, tracked: false })
    }

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 })
    }

    for (const key of Object.keys(body as Record<string, unknown>)) {
      if (!ALLOWED_FIELDS.has(key)) {
        return NextResponse.json({ error: `Campo não permitido: ${key}` }, { status: 400 })
      }
    }

    const { event_type, path, professional_slug, source, referrer, utm_source, utm_medium, utm_campaign } =
      body as Record<string, unknown>

    if (typeof event_type !== 'string' || !(EVENT_TYPES as readonly string[]).includes(event_type)) {
      return NextResponse.json({ error: 'event_type inválido' }, { status: 400 })
    }
    if (SERVER_ONLY_EVENT_TYPES.includes(event_type as AnalyticsEventType)) {
      return NextResponse.json({ error: 'Este evento só pode ser registado pelo servidor' }, { status: 400 })
    }
    if (typeof path !== 'string' || !isAllowedPath(path)) {
      return NextResponse.json({ error: 'path inválido' }, { status: 400 })
    }
    if (source !== undefined && !(SOURCES as readonly string[]).includes(source as string)) {
      return NextResponse.json({ error: 'source inválido' }, { status: 400 })
    }
    if (professional_slug !== undefined && typeof professional_slug !== 'string') {
      return NextResponse.json({ error: 'professional_slug inválido' }, { status: 400 })
    }

    // Validar origem quando o cabeçalho está presente (nem sempre está — apps
    // como WhatsApp/Instagram in-app browsers podem omiti-lo; nesse caso não
    // bloqueamos, confiamos no rate limiting + filtro de bots como compensação)
    const originHeader = req.headers.get('origin') || req.headers.get('referer')
    if (originHeader) {
      const host = extractHostname(originHeader)
      if (host && !ALLOWED_HOSTS.has(host)) {
        return NextResponse.json({ error: 'Origem não permitida' }, { status: 403 })
      }
    }

    const userAgent = req.headers.get('user-agent') || ''
    if (isKnownBot(userAgent)) {
      return NextResponse.json({ success: true, tracked: false })
    }

    const ip = clientIpFrom(req.headers)
    const visitorHash = hashVisitor(ip, userAgent, secret)
    // A partir daqui, IP e User-Agent já não são usados nem guardados em lado nenhum.

    // Rate limiting: no máximo N eventos do mesmo visitante na janela definida.
    // Também funciona como proteção contra duplicações excessivas (ex: cliques
    // repetidos ou re-renderizações do React a disparar o mesmo evento).
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_SECONDS * 1000).toISOString()
    const { count } = await supabaseAdmin
      .from('analytics_events')
      .select('id', { count: 'exact', head: true })
      .eq('visitor_hash', visitorHash)
      .gte('created_at', windowStart)
    if ((count ?? 0) >= RATE_LIMIT_MAX_EVENTS) {
      return NextResponse.json({ success: true, tracked: false })
    }

    // professional_id nunca vem do browser — resolve-se sempre aqui, no
    // servidor, a partir do slug público. Um visitante não consegue atribuir
    // eventos a outro profissional manipulando o pedido.
    let professionalId: string | null = null
    if (typeof professional_slug === 'string' && professional_slug) {
      const { data: prof } = await supabaseAdmin
        .from('professionals')
        .select('id')
        .eq('slug', professional_slug)
        .maybeSingle()
      professionalId = prof?.id ?? null
    }

    const referrerDomain = typeof referrer === 'string' ? extractHostname(referrer) : null
    const utmSourceClean = sanitizeUtm(typeof utm_source === 'string' ? utm_source : null)
    const utmMediumClean = sanitizeUtm(typeof utm_medium === 'string' ? utm_medium : null)
    const utmCampaignClean = sanitizeUtm(typeof utm_campaign === 'string' ? utm_campaign : null)
    const originChannel = normalizeOriginChannel(referrerDomain, utmSourceClean)

    const { error } = await supabaseAdmin.from('analytics_events').insert({
      event_type,
      professional_id: professionalId,
      visitor_hash: visitorHash,
      source: source ?? null,
      path,
      referrer_domain: referrerDomain,
      utm_source: utmSourceClean,
      utm_medium: utmMediumClean,
      utm_campaign: utmCampaignClean,
      origin_channel: originChannel,
    })
    if (error) {
      console.error(`[api/track] falha ao gravar evento: ${error.message}`)
      return NextResponse.json({ success: true, tracked: false })
    }

    return NextResponse.json({ success: true, tracked: true })
  } catch (err) {
    console.error('[api/track] erro inesperado:', err instanceof Error ? err.message : err)
    return NextResponse.json({ success: true, tracked: false })
  }
}
