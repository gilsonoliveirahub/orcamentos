import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SiteOpsReadonlySummary } from '@/lib/site-ops-readonly-summary'

const VALID_TOKEN = 'readonly-token-ficticio-com-mais-de-24-caracteres'
const VALID_RPC_SECRET_KEY = 'sb_secret_ficticia_com_mais_de_24_caracteres'

const SUMMARY: SiteOpsReadonlySummary = {
  generated_at: '2026-10-07T12:00:00.000Z',
  leads: {
    total: 3,
    assigned_total: 2,
    with_closed_value_total: 2,
    closed_value_sum: 375,
    by_status: { novo: 1, fechado: 2 },
    by_source: { marketplace: 2, pessoal: 1 },
    by_specialty: { Pintura: 2, 'Canalização': 1 },
    by_zone_requested: { Porto: 2, Lisboa: 1 },
    by_month: { '2026-10': 2, '2026-09': 1 },
  },
  professionals: {
    total: 2,
    active_total: 1,
    inactive_total: 1,
    trial_ending_soon_total: 1,
    by_plan: { pro: 1, inactive: 1 },
    by_specialty: { Pintura: 1, Pladur: 1, 'Canalização': 1 },
    by_zone: { Porto: 1, Lisboa: 1 },
    by_month: { '2026-10': 1, '2026-09': 1 },
  },
  analytics: {
    events_total: 5,
    unique_visitors_daily_sum: 4,
    by_event_type: { profile_view: 3, request_started: 2 },
    by_origin_channel: { google: 3, direto: 2 },
    by_source: { marketplace: 5 },
    by_day: { '2026-10-06': 5 },
  },
}

async function loadRoute(rpcResult: { data: unknown; error: { message: string } | null } = { data: SUMMARY, error: null }) {
  vi.resetModules()
  const rpc = vi.fn().mockResolvedValue(rpcResult)
  const createClient = vi.fn(() => ({ rpc }))
  vi.doMock('@supabase/supabase-js', () => ({ createClient }))
  const route = await import('./route')
  return { route, rpc, createClient }
}

function request(token?: string) {
  return new Request('http://localhost/api/internal/site-ops/summary', {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
}

describe('/api/internal/site-ops/summary', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.doUnmock('@supabase/supabase-js')
  })

  it('rejeita token ausente e errado sem consultar Supabase e com cache privado/no-store', async () => {
    vi.stubEnv('SITE_FACOPORTI_OPS_READONLY_TOKEN', VALID_TOKEN)
    vi.stubEnv('SITE_FACOPORTI_OPS_RPC_SECRET_KEY', VALID_RPC_SECRET_KEY)
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    const { route, createClient } = await loadRoute()

    const missing = await route.GET(request() as never)
    const wrong = await route.GET(request('token-errado-com-mais-de-24-caracteres') as never)

    expect(missing.status).toBe(403)
    expect(wrong.status).toBe(403)
    expect(missing.headers.get('Cache-Control')).toBe('no-store, private')
    expect(wrong.headers.get('Cache-Control')).toBe('no-store, private')
    expect(createClient).not.toHaveBeenCalled()
  })

  it('com token correto chama uma única RPC agregada com a secret key dedicada só no apikey, sem PII nem cache público', async () => {
    vi.stubEnv('SITE_FACOPORTI_OPS_READONLY_TOKEN', VALID_TOKEN)
    vi.stubEnv('SITE_FACOPORTI_OPS_RPC_SECRET_KEY', VALID_RPC_SECRET_KEY)
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    const { route, rpc, createClient } = await loadRoute()

    const response = await route.GET(request(VALID_TOKEN) as never)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store, private')
    expect(JSON.stringify(body)).not.toMatch(/cliente@example\.com|912345678|Ana Silva|prof-1|professional_id|phone|email/i)
    expect(body.leads.total).toBe(3)
    expect(body.leads.closed_value_sum).toBe(375)
    expect(body.analytics.unique_visitors_daily_sum).toBe(4)
    // Match exato (não objectContaining): confirma que NÃO existe nenhum
    // `global.headers.Authorization` montado à mão com a secret key — ela
    // só pode ir como apikey, via comportamento nativo do supabase-js.
    expect(createClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      VALID_RPC_SECRET_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    )
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('site_ops_readonly_summary')
  })

  it('propaga erro RPC/RLS como 500 e nunca devolve zeros silenciosos', async () => {
    vi.stubEnv('SITE_FACOPORTI_OPS_READONLY_TOKEN', VALID_TOKEN)
    vi.stubEnv('SITE_FACOPORTI_OPS_RPC_SECRET_KEY', VALID_RPC_SECRET_KEY)
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { route } = await loadRoute({ data: null, error: { message: 'permission denied' } })

    const response = await route.GET(request(VALID_TOKEN) as never)
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(response.headers.get('Cache-Control')).toBe('no-store, private')
    expect(body).toEqual({ error: 'Falha ao gerar resumo read-only' })
  })

  it('recusa métodos de escrita explicitamente', async () => {
    const { route } = await loadRoute()

    for (const method of [route.POST, route.PUT, route.PATCH, route.DELETE]) {
      const response = await method()
      expect(response.status).toBe(405)
      expect(response.headers.get('Allow')).toBe('GET')
      expect(response.headers.get('Cache-Control')).toBe('no-store, private')
    }
  })
})
