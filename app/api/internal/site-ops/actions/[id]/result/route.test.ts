import { afterEach, describe, expect, it, vi } from 'vitest'

const VALID_TOKEN = 'actions-token-ficticio-com-mais-de-24-caracteres'
const VALID_DB_URL = 'postgresql://site_ops_actions_server.ref:senha-ficticia@aws-1-eu-west-1.pooler.supabase.com:6543/postgres'

async function loadRoute(queryImpl?: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>) {
  vi.resetModules()
  const connect = vi.fn().mockResolvedValue(undefined)
  const query = vi.fn(queryImpl ?? (() => Promise.resolve({ rows: [{ ok: true }] })))
  const end = vi.fn().mockResolvedValue(undefined)
  const Client = vi.fn(function ClientMock() {
    return { connect, query, end }
  })
  vi.doMock('pg', () => ({ Client }))
  const route = await import('./route')
  return { route, connect, query, end, Client }
}

function params(id: string) {
  return { params: Promise.resolve({ id }) }
}

function patchRequest(body: unknown, token?: string) {
  return new Request('http://localhost/api/internal/site-ops/actions/x/result', {
    method: 'PATCH',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('/api/internal/site-ops/actions/[id]/result', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.doUnmock('pg')
  })

  it('rejeita sem token válido, sem ligar à base', async () => {
    vi.stubEnv('SITE_FACOPORTI_AQUILES_ACTIONS_TOKEN', VALID_TOKEN)
    vi.stubEnv('SITE_FACOPORTI_AQUILES_ACTIONS_DB_URL', VALID_DB_URL)
    const { route, Client } = await loadRoute()
    const response = await route.PATCH(patchRequest({ success: true }) as never, params('id-1'))
    expect(response.status).toBe(403)
    expect(Client).not.toHaveBeenCalled()
  })

  it('rejeita sem "success" booleano', async () => {
    vi.stubEnv('SITE_FACOPORTI_AQUILES_ACTIONS_TOKEN', VALID_TOKEN)
    vi.stubEnv('SITE_FACOPORTI_AQUILES_ACTIONS_DB_URL', VALID_DB_URL)
    const { route, Client } = await loadRoute()
    const response = await route.PATCH(patchRequest({ result: {} }, VALID_TOKEN) as never, params('id-1'))
    expect(response.status).toBe(400)
    expect(Client).not.toHaveBeenCalled()
  })

  it('devolve 409 quando a RPC não confirma (não estava em consumed)', async () => {
    vi.stubEnv('SITE_FACOPORTI_AQUILES_ACTIONS_TOKEN', VALID_TOKEN)
    vi.stubEnv('SITE_FACOPORTI_AQUILES_ACTIONS_DB_URL', VALID_DB_URL)
    const { route } = await loadRoute(() => Promise.resolve({ rows: [{ ok: false }] }))
    const response = await route.PATCH(patchRequest({ success: true }, VALID_TOKEN) as never, params('id-1'))
    expect(response.status).toBe(409)
  })

  it('registra sucesso como executed', async () => {
    vi.stubEnv('SITE_FACOPORTI_AQUILES_ACTIONS_TOKEN', VALID_TOKEN)
    vi.stubEnv('SITE_FACOPORTI_AQUILES_ACTIONS_DB_URL', VALID_DB_URL)
    const { route, query } = await loadRoute(() => Promise.resolve({ rows: [{ ok: true }] }))
    const response = await route.PATCH(patchRequest({ success: true, result: { leads_apagados: 1 } }, VALID_TOKEN) as never, params('id-1'))
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body).toEqual({ id: 'id-1', status: 'executed' })
    expect(query).toHaveBeenCalledWith('select public.aquiles_record_execution_result($1, $2, $3) as ok', ['id-1', true, '{"leads_apagados":1}'])
  })

  it('registra falha como failed, nunca como executed', async () => {
    vi.stubEnv('SITE_FACOPORTI_AQUILES_ACTIONS_TOKEN', VALID_TOKEN)
    vi.stubEnv('SITE_FACOPORTI_AQUILES_ACTIONS_DB_URL', VALID_DB_URL)
    const { route, query } = await loadRoute(() => Promise.resolve({ rows: [{ ok: true }] }))
    const response = await route.PATCH(patchRequest({ success: false, result: { erro: 'timeout' } }, VALID_TOKEN) as never, params('id-1'))
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body).toEqual({ id: 'id-1', status: 'failed' })
    expect(query).toHaveBeenCalledWith('select public.aquiles_record_execution_result($1, $2, $3) as ok', ['id-1', false, '{"erro":"timeout"}'])
  })

  it('métodos não previstos são recusados', async () => {
    const { route } = await loadRoute()
    for (const method of [route.GET, route.POST, route.PUT, route.DELETE]) {
      const response = await method()
      expect(response.status).toBe(405)
      expect(response.headers.get('Allow')).toBe('PATCH')
    }
  })
})
