import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SiteOpsReadonlySummary } from '@/lib/site-ops-readonly-summary'

const VALID_TOKEN = 'readonly-token-ficticio-com-mais-de-24-caracteres'
const VALID_DB_URL = 'postgresql://site_ops_readonly_server.ref:senha-ficticia@aws-1-eu-west-1.pooler.supabase.com:6543/postgres'

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

async function loadRoute(queryResult: { rows: Array<{ summary: unknown }> } | null = { rows: [{ summary: SUMMARY }] }, connectError: Error | null = null) {
  vi.resetModules()
  const connect = connectError ? vi.fn().mockRejectedValue(connectError) : vi.fn().mockResolvedValue(undefined)
  const query = queryResult
    ? vi.fn().mockResolvedValue(queryResult)
    : vi.fn().mockRejectedValue(new Error('permission denied'))
  const end = vi.fn().mockResolvedValue(undefined)
  const Client = vi.fn(function ClientMock() {
    return { connect, query, end }
  })
  vi.doMock('pg', () => ({ Client }))
  const route = await import('./route')
  return { route, connect, query, end, Client }
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
    vi.doUnmock('pg')
  })

  it('rejeita token ausente e errado sem ligar à base e com cache privado/no-store', async () => {
    vi.stubEnv('SITE_FACOPORTI_OPS_READONLY_TOKEN', VALID_TOKEN)
    vi.stubEnv('SITE_FACOPORTI_OPS_DB_URL', VALID_DB_URL)
    const { route, Client } = await loadRoute()

    const missing = await route.GET(request() as never)
    const wrong = await route.GET(request('token-errado-com-mais-de-24-caracteres') as never)

    expect(missing.status).toBe(403)
    expect(wrong.status).toBe(403)
    expect(missing.headers.get('Cache-Control')).toBe('no-store, private')
    expect(wrong.headers.get('Cache-Control')).toBe('no-store, private')
    expect(Client).not.toHaveBeenCalled()
  })

  it('com token correto liga via pg com TLS validado (CA fixado) e sem credenciais Supabase, sem PII', async () => {
    vi.stubEnv('SITE_FACOPORTI_OPS_READONLY_TOKEN', VALID_TOKEN)
    vi.stubEnv('SITE_FACOPORTI_OPS_DB_URL', VALID_DB_URL)
    const { route, query, connect, end, Client } = await loadRoute()

    const response = await route.GET(request(VALID_TOKEN) as never)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store, private')
    expect(JSON.stringify(body)).not.toMatch(/cliente@example\.com|912345678|Ana Silva|prof-1|professional_id|phone|email/i)
    expect(body.leads.total).toBe(3)
    expect(body.leads.closed_value_sum).toBe(375)
    expect(body.analytics.unique_visitors_daily_sum).toBe(4)

    expect(Client).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionString: VALID_DB_URL,
        ssl: expect.objectContaining({ rejectUnauthorized: true, ca: expect.stringContaining('BEGIN CERTIFICATE') }),
      })
    )
    expect(connect).toHaveBeenCalledTimes(1)
    expect(query).toHaveBeenCalledTimes(1)
    expect(query).toHaveBeenCalledWith('select public.site_ops_readonly_summary() as summary')
    expect(end).toHaveBeenCalledTimes(1)
  })

  it('propaga erro de ligação/query como 500, fecha a ligação e nunca devolve zeros silenciosos', async () => {
    vi.stubEnv('SITE_FACOPORTI_OPS_READONLY_TOKEN', VALID_TOKEN)
    vi.stubEnv('SITE_FACOPORTI_OPS_DB_URL', VALID_DB_URL)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { route, end } = await loadRoute(null)

    const response = await route.GET(request(VALID_TOKEN) as never)
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(response.headers.get('Cache-Control')).toBe('no-store, private')
    expect(body).toEqual({ error: 'Falha ao gerar resumo read-only' })
    expect(end).toHaveBeenCalledTimes(1)
  })

  it('fecha sempre a ligação mesmo quando client.connect() falha', async () => {
    vi.stubEnv('SITE_FACOPORTI_OPS_READONLY_TOKEN', VALID_TOKEN)
    vi.stubEnv('SITE_FACOPORTI_OPS_DB_URL', VALID_DB_URL)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { route, end } = await loadRoute(undefined, new Error('self-signed certificate in certificate chain'))

    const response = await route.GET(request(VALID_TOKEN) as never)

    expect(response.status).toBe(500)
    expect(end).toHaveBeenCalledTimes(1)
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
