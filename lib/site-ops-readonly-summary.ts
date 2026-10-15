import { timingSafeEqual } from 'crypto'

export type SiteOpsReadonlySummary = {
  generated_at: string
  leads: {
    total: number
    assigned_total: number
    with_closed_value_total: number
    closed_value_sum: number
    by_status: Record<string, number>
    by_source: Record<string, number>
    by_specialty: Record<string, number>
    by_zone_requested: Record<string, number>
    by_month: Record<string, number>
  }
  professionals: {
    total: number
    active_total: number
    inactive_total: number
    trial_ending_soon_total: number
    by_plan: Record<string, number>
    by_specialty: Record<string, number>
    by_zone: Record<string, number>
    by_month: Record<string, number>
  }
  analytics: {
    events_total: number
    unique_visitors_daily_sum: number
    by_event_type: Record<string, number>
    by_origin_channel: Record<string, number>
    by_source: Record<string, number>
    by_day: Record<string, number>
  }
}

export type SupabaseReadonlyRpcClient = {
  rpc(functionName: 'site_ops_readonly_summary'): PromiseLike<{
    data: unknown
    error: { message: string } | null
  }>
}

const TOKEN_MIN_LENGTH = 24
const REQUIRED_TOP_LEVEL_KEYS = ['generated_at', 'leads', 'professionals', 'analytics'] as const

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasNoPiiKeys(value: unknown): boolean {
  if (Array.isArray(value)) return value.every(hasNoPiiKeys)
  if (!isPlainRecord(value)) return true

  for (const key of Object.keys(value)) {
    if (/^(id|name|email|phone|telefone|telemovel|telemóvel|client|cliente|professional_id|user_id)$/i.test(key)) {
      return false
    }
    if (!hasNoPiiKeys(value[key])) return false
  }
  return true
}

function normalizeRpcPayload(data: unknown): SiteOpsReadonlySummary {
  const payload = Array.isArray(data) && data.length === 1 ? data[0] : data

  if (!isPlainRecord(payload)) {
    throw new Error('Resposta inválida da RPC site_ops_readonly_summary')
  }

  for (const key of REQUIRED_TOP_LEVEL_KEYS) {
    if (!(key in payload)) throw new Error(`Resposta da RPC sem campo obrigatório: ${key}`)
  }

  if (!hasNoPiiKeys(payload)) {
    throw new Error('Resposta da RPC contém campo pessoal ou identificador proibido')
  }

  return payload as SiteOpsReadonlySummary
}

export function tokenConfigured(token: string | undefined): token is string {
  return typeof token === 'string' && token.length >= TOKEN_MIN_LENGTH
}

export function verifySiteOpsReadonlyToken(provided: string | null | undefined, expected: string | undefined) {
  if (typeof expected !== 'string' || expected.length < TOKEN_MIN_LENGTH || !provided) return false
  const providedBuffer = Buffer.from(provided)
  const expectedBuffer = Buffer.from(expected)
  if (providedBuffer.length !== expectedBuffer.length) return false
  return timingSafeEqual(providedBuffer, expectedBuffer)
}

export function extractBearerToken(authorization: string | null) {
  if (!authorization) return null
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

export async function fetchSiteOpsReadonlySummary(supabase: SupabaseReadonlyRpcClient) {
  const { data, error } = await supabase.rpc('site_ops_readonly_summary')
  if (error) throw new Error(error.message)
  return normalizeRpcPayload(data)
}
