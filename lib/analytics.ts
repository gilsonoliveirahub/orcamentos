import { createHmac } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const EVENT_TYPES = [
  'page_view',
  'quote_cta_click',
  'request_started',
  'request_completed',
  'whatsapp_click',
  'email_click',
  'registration_completed',
] as const
export type AnalyticsEventType = typeof EVENT_TYPES[number]

// Eventos que só podem ser gravados pelo próprio servidor (nunca aceites via /api/track)
export const SERVER_ONLY_EVENT_TYPES: readonly AnalyticsEventType[] = ['request_completed', 'registration_completed']

export const REGISTRATION_ROLES = ['profissional', 'cliente'] as const
export type RegistrationRole = typeof REGISTRATION_ROLES[number]

export const ORIGIN_CHANNELS = ['facebook', 'instagram', 'whatsapp', 'google', 'ia', 'direto', 'outro'] as const
export type OriginChannel = typeof ORIGIN_CHANNELS[number]

export const SOURCES = ['pessoal', 'marketplace'] as const
export type AnalyticsSource = typeof SOURCES[number]

const FIXED_PATHS = ['/', '/contactos', '/pedir', '/comecar', '/juntar', '/exclusivo'] as const
const SLUG_PATH_RE = /^\/p\/[a-z0-9-]{1,80}$/

export function isAllowedPath(path: string): boolean {
  if ((FIXED_PATHS as readonly string[]).includes(path)) return true
  return SLUG_PATH_RE.test(path)
}

// Páginas de entrada/registo destinadas a PROFISSIONAIS (captação — nunca
// enviam cliente nenhum, só CTA para /login?tab=register) — distintas do
// resto do "site" (home, /pedir, /contactos, registo de CLIENTE). Usado só
// para eventos sem professional_id (page_view/registration_completed);
// visitas a /p/[slug] já são sempre de clientes a consultar um perfil
// específico e nunca passam por esta classificação (têm professional_id
// preenchido, ver app/api/track/route.ts).
const PROFESSIONAL_RECRUITMENT_PATHS = ['/comecar', '/juntar', '/exclusivo', '/registo/profissional'] as const

export type NullProfessionalBucket = 'area_profissional' | 'site'

export function classifyNullProfessionalPath(path: string): NullProfessionalBucket {
  return (PROFESSIONAL_RECRUITMENT_PATHS as readonly string[]).includes(path) ? 'area_profissional' : 'site'
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

// true só em produção real na Vercel (VERCEL_ENV='production'). Preview
// deployments e ambiente local ficam sempre de fora — sem isto, cada preview
// de PR e cada teste manual em localhost inflacionava os números reais.
// Único ponto de decisão, usado tanto pelos dois eventos server-only aqui
// (recordRequestCompleted/recordRegistrationCompleted) como por
// app/api/track/route.ts (eventos vindos do browser) — nenhum dos dois
// grava nada fora de produção.
export function isProductionTraffic(): boolean {
  return process.env.VERCEL_ENV === 'production'
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
  // Só domínios de produtos de chat/IA dedicados, nunca motores de busca
  // ambíguos (bing.com, google.com já classificado acima como 'google') —
  // sinal parcial e observável (visita cujo referrer passou por aqui), não
  // uma confirmação de que a IA "recomendou" o FaçoPorTi. Ver AI Visibility
  // KPI (lib/ai-visibility.ts) para a distinção entre o que é mensurável
  // hoje e o que fica só preparado para o futuro.
  'chat.openai.com': 'ia',
  'chatgpt.com': 'ia',
  'claude.ai': 'ia',
  'gemini.google.com': 'ia',
  'perplexity.ai': 'ia',
  'copilot.microsoft.com': 'ia',
  'you.com': 'ia',
}

export function normalizeOriginChannel(referrerDomain: string | null, utmSource: string | null): OriginChannel {
  const src = (utmSource || '').toLowerCase()
  if (src.includes('facebook')) return 'facebook'
  if (src.includes('instagram')) return 'instagram'
  if (src.includes('chatgpt') || src.includes('claude') || src.includes('gemini') || src.includes('perplexity') || src.includes('copilot')) return 'ia'
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
  referrerDomain?: string | null
  utmSource?: string | null
  utmMedium?: string | null
  utmCampaign?: string | null
  originChannel?: OriginChannel | null
}) {
  if (!isProductionTraffic()) return
  const secret = process.env.ANALYTICS_HASH_SECRET
  if (!secret) {
    console.error('[analytics] ANALYTICS_HASH_SECRET em falta — request_completed não registado')
    return
  }
  if (isKnownBot(params.userAgent)) return

  const visitorHash = hashVisitor(params.ip, params.userAgent, secret)

  // Mesmos campos de atribuição de campanha já gravados em page_view/
  // request_started (ver /api/track) — sem isto, o passo de conversão do
  // funil (pedido concluído) ficava sempre sem canal/UTM, impossibilitando
  // medir que campanha gerou pedidos, e não só visitas.
  const { error } = await supabaseAdmin.from('analytics_events').insert({
    event_type: 'request_completed',
    professional_id: params.professionalId,
    visitor_hash: visitorHash,
    source: params.source,
    path: params.path,
    referrer_domain: params.referrerDomain ?? null,
    utm_source: params.utmSource ?? null,
    utm_medium: params.utmMedium ?? null,
    utm_campaign: params.utmCampaign ?? null,
    origin_channel: params.originChannel ?? null,
  })
  if (error) {
    console.error(`[analytics] falha ao registar request_completed: ${error.message}`)
  }
}

/**
 * Regista um registo concluído (conta de profissional ou de cliente criada
 * com sucesso). Mesmo padrão de recordRequestCompleted — só chamado a partir
 * de app/api/auth/register/route.ts depois do insert em `professionals`/
 * `clients` ter sucesso, nunca aceite via /api/track. `professional_id` fica
 * sempre null (nem o profissional que se está a registar tem id atribuído
 * antes deste momento, nem um cliente pertence a nenhum profissional
 * específico) — por isso conta sempre como tráfego "do site", nunca de um
 * perfil individual. O papel (profissional/cliente) vai no `path`, já que a
 * tabela não tem nenhuma coluna livre própria para isso.
 */
export async function recordRegistrationCompleted(params: {
  ip: string
  userAgent: string
  role: RegistrationRole
}) {
  if (!isProductionTraffic()) return
  const secret = process.env.ANALYTICS_HASH_SECRET
  if (!secret) {
    console.error('[analytics] ANALYTICS_HASH_SECRET em falta — registration_completed não registado')
    return
  }
  if (isKnownBot(params.userAgent)) return

  const visitorHash = hashVisitor(params.ip, params.userAgent, secret)

  const { error } = await supabaseAdmin.from('analytics_events').insert({
    event_type: 'registration_completed',
    professional_id: null,
    visitor_hash: visitorHash,
    source: null,
    path: `/registo/${params.role}`,
    origin_channel: null,
  })
  if (error) {
    console.error(`[analytics] falha ao registar registration_completed: ${error.message}`)
  }
}

export function clientIpFrom(headers: Headers): string {
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || headers.get('x-real-ip')
    || 'unknown'
}
