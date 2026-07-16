import { createHmac } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const EVENT_TYPES = [
  'page_view',
  'quote_cta_click',
  'request_started',
  'request_completed',
  'whatsapp_click',
  'email_click',
] as const
export type AnalyticsEventType = typeof EVENT_TYPES[number]

// Eventos que só podem ser gravados pelo próprio servidor (nunca aceites via /api/track)
export const SERVER_ONLY_EVENT_TYPES: readonly AnalyticsEventType[] = ['request_completed']

export const ORIGIN_CHANNELS = ['facebook', 'instagram', 'whatsapp', 'google', 'direto', 'outro'] as const
export type OriginChannel = typeof ORIGIN_CHANNELS[number]

export const SOURCES = ['pessoal', 'marketplace'] as const
export type AnalyticsSource = typeof SOURCES[number]

const FIXED_PATHS = ['/', '/contactos', '/pedir'] as const
const SLUG_PATH_RE = /^\/p\/[a-z0-9-]{1,80}$/

export function isAllowedPath(path: string): boolean {
  if ((FIXED_PATHS as readonly string[]).includes(path)) return true
  return SLUG_PATH_RE.test(path)
}

// User-Agents de crawlers/bots/pré-visualizações conhecidos — nunca contam
// como visita real. Inclui explicitamente o crawler de pré-visualização de
// links do próprio WhatsApp (abrir um link partilhado no WhatsApp dispara um
// pedido do WhatsApp/Facebook para gerar a pré-visualização, não é uma pessoa).
const KNOWN_BOT_UA = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegrambot|discordbot|curl\/|wget\/|python-requests|go-http-client|headlesschrome|preview|monitor|pingdom|uptimerobot/i

export function isKnownBot(userAgent: string | null | undefined): boolean {
  if (!userAgent || !userAgent.trim()) return true
  return KNOWN_BOT_UA.test(userAgent)
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10) // YYYY-MM-DD
}

/**
 * HMAC_SHA256(ANALYTICS_HASH_SECRET, data + IP + User-Agent).
 * O segredo é permanente (nunca muda) — o identificador resultante muda
 * todos os dias só porque a data entra no cálculo. IP e User-Agent nunca
 * são devolvidos nem guardados; entram apenas como input do hash em memória.
 */
export function hashVisitor(ip: string, userAgent: string, secret: string, day: string = todayUTC()): string {
  return createHmac('sha256', secret).update(`${day}:${ip}:${userAgent}`).digest('hex')
}

const MAX_UTM_LEN = 100

// Só letras, números, espaço, hífen, underscore e ponto — remove qualquer
// caractere que possa ser interpretado como HTML/markup (<, >, &, aspas, etc.)
const UTM_SAFE_RE = /[^a-zA-Z0-9 \-_.]/g

export function sanitizeUtm(value: string | null | undefined): string | null {
  if (!value) return null
  const stripped = value.replace(UTM_SAFE_RE, '').trim().slice(0, MAX_UTM_LEN)
  return stripped || null
}

export function extractHostname(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}

const CHANNEL_DOMAINS: Record<string, OriginChannel> = {
  'facebook.com': 'facebook',
  'fb.com': 'facebook',
  'l.facebook.com': 'facebook',
  'lm.facebook.com': 'facebook',
  'instagram.com': 'instagram',
  'l.instagram.com': 'instagram',
  'whatsapp.com': 'whatsapp',
  'wa.me': 'whatsapp',
  'api.whatsapp.com': 'whatsapp',
  'google.com': 'google',
  'google.pt': 'google',
}

export function normalizeOriginChannel(referrerDomain: string | null, utmSource: string | null): OriginChannel {
  const src = (utmSource || '').toLowerCase()
  if (src.includes('facebook')) return 'facebook'
  if (src.includes('instagram')) return 'instagram'
  if (src.includes('whatsapp')) return 'whatsapp'
  if (src.includes('google')) return 'google'
  if (referrerDomain && CHANNEL_DOMAINS[referrerDomain]) return CHANNEL_DOMAINS[referrerDomain]
  if (!referrerDomain && !utmSource) return 'direto'
  return 'outro'
}

/**
 * Regista um pedido concluído (lead criado com sucesso). Só deve ser chamado
 * a partir de rotas server-side que acabaram de criar o lead (/api/leads/public,
 * /api/leads/marketplace) — nunca é aceite vindo do browser via /api/track.
 * Calcula o visitor_hash a partir do próprio pedido HTTP recebido, mantendo o
 * mesmo visitante identificável ao longo do funil (page_view -> ... -> request_completed).
 */
export async function recordRequestCompleted(params: {
  ip: string
  userAgent: string
  professionalId: string | null
  source: AnalyticsSource
  path: string
}) {
  const secret = process.env.ANALYTICS_HASH_SECRET
  if (!secret) {
    console.error('[analytics] ANALYTICS_HASH_SECRET em falta — request_completed não registado')
    return
  }
  if (isKnownBot(params.userAgent)) return

  const visitorHash = hashVisitor(params.ip, params.userAgent, secret)

  const { error } = await supabaseAdmin.from('analytics_events').insert({
    event_type: 'request_completed',
    professional_id: params.professionalId,
    visitor_hash: visitorHash,
    source: params.source,
    path: params.path,
  })
  if (error) {
    console.error(`[analytics] falha ao registar request_completed: ${error.message}`)
  }
}

export function clientIpFrom(headers: Headers): string {
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || headers.get('x-real-ip')
    || 'unknown'
}
