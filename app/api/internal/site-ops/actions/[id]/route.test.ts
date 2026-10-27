import { afterEach, describe, expect, it, vi } from 'vitest'

const VALID_TOKEN = 'actions-token-ficticio-com-mais-de-24-caracteres'
const VALID_DB_URL = 'postgresql://site_ops_actions_server.ref:senha-ficticia@aws-1-eu-west-1.pooler.supabase.com:6543/postgres'

async function loadRoute(queryImpl?: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>) {
  vi.resetModules()
  const connect = vi.fn().mockResolvedValue(undefined)
  const query = vi.fn(queryImpl ?? (() => Promise.resolve({ rows: [{ action: null }] })))
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

function getRequest(token?: string) {
  return new Request('http://localhost/api/internal/site-ops/actions/x', {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
}

function patchRequest(body: unknown, token?: string) {
  return new Request('http://localhost/api/internal/site-ops/actions/x', {
    method: 'PATCH',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('/api/internal/site-ops/actions/[id]', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.doUnmock('pg')
  })

  it('GET rejeita sem token válido, sem ligar à base', async () => {
    vi.stubEnv('SITE_FACOPORTI_AQUILES_ACTIONS_TOKEN', VALID_TOKEN)
    vi.stubEnv('SITE_FACOPORTI_AQUILES_ACTIONS_DB_URL', VALID_DB_URL)
    const { route, Client } = await loadRoute()
    const response = await route.GET(getRequest() as never, params('id-1'))
    expect(response.status).toBe(403)
    expect(Client).not.toHaveBeenCalled()
  })

  it('GET devolve 404 quando a ação não existe ou é de outro perfil (RPC filtra por session_user)', async () => {
    vi.stubEnv('SITE_FACOPORTI_AQUILES_ACTIONS_TOKEN', VALID_TOKEN)
    vi.stubEnv('SITE_FACOPORTI_AQUILES_ACTIONS_DB_URL', VALID_DB_URL)
    const { route, query } = await loadRoute(() => Promise.resolve({ rows: [{ action: null }] }))
    const response = await route.GET(getRequest(VALID_TOKEN) as never, params('id-1'))
    expect(response.status).toBe(404)
    expect(query).toHaveBeenCalledWith('select public.aquiles_get_action($1) as action', ['id-1'])
  })

  it('GET devolve a ação quando encontrada', async () => {
    vi.stubEnv('SITE_FACOPORTI_AQUILES_ACTIONS_TOKEN', VALID_TOKEN)
    vi.stubEnv('SITE_FACOPORTI_AQUILES_ACTIONS_DB_URL', VALID_DB_URL)
    const { route } = await loadRoute(() => Promise.resolve({ rows: [{ action: { id: 'id-1', status: 'approved' } }] }))
    const response = await route.GET(getRequest(VALID_TOKEN) as never, params('id-1'))
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.action).toEqual({ id: 'id-1', status: 'approved' })
  })

  it('PATCH rejeita sem action_type válido', async () => {
    vi.stubEnv('SITE_FACOPORTI_AQUILES_ACTIONS_TOKEN', VALID_TOKEN)
    vi.stubEnv('SITE_FACOPORTI_AQUILES_ACTIONS_DB_URL', VALID_DB_URL)
    const { route, Client } = await loadRoute()
    const response = await route.PATCH(patchRequest({ action_type: 'inventado', payload: {} }, VALID_TOKEN) as never, params('id-1'))
    expect(response.status).toBe(400)
    expect(Client).not.toHaveBeenCalled()
  })

  it('PATCH devolve 409 quando a RPC não confirma o consumo (não aprovada, expirada, já executada, ou parâmetros não coincidem)', async () => {
    vi.stubEnv('SITE_FACOPORTI_AQUILES_ACTIONS_TOKEN', VALID_TOKEN)
    vi.stubEnv('SITE_FACOPORTI_AQUILES_ACTIONS_DB_URL', VALID_DB_URL)
    const { route } = await loadRoute(() => Promise.resolve({ rows: [{ ok: false }] }))
    const response = await route.PATCH(
      patchRequest({ action_type: 'delete_permanent', payload: { lead_id: '123' } }, VALID_TOKEN) as never,
      params('id-1')
    )
    expect(response.status).toBe(409)
  })

  it('PATCH consome a aprovação (approved -> consumed, nunca "executed" diretamente) com os parâmetros exatos', async () => {
    vi.stubEnv('SITE_FACOPORTI_AQUILES_ACTIONS_TOKEN', VALID_TOKEN)
    vi.stubEnv('SITE_FACOPORTI_AQUILES_ACTIONS_DB_URL', VALID_DB_URL)
    const { route, query } = await loadRoute(() => Promise.resolve({ rows: [{ ok: true }] }))
    const response = await route.PATCH(
      patchRequest({ action_type: 'delete_permanent', payload: { lead_id: '123' } }, VALID_TOKEN) as never,
      params('id-1')
    )
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body).toEqual({ id: 'id-1', status: 'consumed' })
    expect(query).toHaveBeenCalledWith(
      'select public.aquiles_consume_approved_action($1, $2, $3) as ok',
      ['id-1', 'delete_permanent', '{"lead_id":"123"}']
    )
  })

  it('métodos não previstos são recusados', async () => {
    const { route } = await loadRoute()
    for (const method of [route.POST, route.PUT, route.DELETE]) {
      const response = await method()
      expect(response.status).toBe(405)
      expect(response.headers.get('Allow')).toBe('GET, PATCH')
    }
  })
})
