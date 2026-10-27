import { afterEach, describe, expect, it, vi } from 'vitest'

const VALID_TOKEN = 'actions-token-ficticio-com-mais-de-24-caracteres'
const VALID_DB_URL = 'postgresql://site_ops_actions_server.ref:senha-ficticia@aws-1-eu-west-1.pooler.supabase.com:6543/postgres'

async function loadRoute(queryImpl?: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>) {
  vi.resetModules()
  const connect = vi.fn().mockResolvedValue(undefined)
  const query = vi.fn(queryImpl ?? (() => Promise.resolve({ rows: [{ id: 'novo-id' }] })))
  const end = vi.fn().mockResolvedValue(undefined)
  const Client = vi.fn(function ClientMock() {
    return { connect, query, end }
  })
  vi.doMock('pg', () => ({ Client }))
  const route = await import('./route')
  return { route, connect, query, end, Client }
}

function postRequest(body: unknown, token?: string) {
  return new Request('http://localhost/api/internal/site-ops/actions', {
    method: 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function getRequest(token?: string) {
  return new Request('http://localhost/api/internal/site-ops/actions', {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
}

describe('/api/internal/site-ops/actions', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.doUnmock('pg')
  })

  it('POST rejeita sem token e com token errado, sem ligar à base', async () => {
    vi.stubEnv('SITE_FACOPORTI_AQUILES_ACTIONS_TOKEN', VALID_TOKEN)
    vi.stubEnv('SITE_FACOPORTI_AQUILES_ACTIONS_DB_URL', VALID_DB_URL)
    const { route, Client } = await loadRoute()

    const missing = await route.POST(postRequest({ action_type: 'delete_permanent', summary: 'x' }) as never)
    const wrong = await route.POST(postRequest({ action_type: 'delete_permanent', summary: 'x' }, 'token-errado-com-mais-de-24-caracteres') as never)

    expect(missing.status).toBe(403)
    expect(wrong.status).toBe(403)
    expect(Client).not.toHaveBeenCalled()
  })

  it('POST rejeita action_type inválido ou summary vazio', async () => {
    vi.stubEnv('SITE_FACOPORTI_AQUILES_ACTIONS_TOKEN', VALID_TOKEN)
    vi.stubEnv('SITE_FACOPORTI_AQUILES_ACTIONS_DB_URL', VALID_DB_URL)
    const { route, Client } = await loadRoute()

    const badType = await route.POST(postRequest({ action_type: 'apagar_tudo', summary: 'x' }, VALID_TOKEN) as never)
    const noSummary = await route.POST(postRequest({ action_type: 'delete_permanent', summary: '  ' }, VALID_TOKEN) as never)

    expect(badType.status).toBe(400)
    expect(noSummary.status).toBe(400)
    expect(Client).not.toHaveBeenCalled()
  })

  it('POST com token correto cria o pedido sempre em pending (sem requested_by no corpo da RPC) e devolve 201', async () => {
    vi.stubEnv('SITE_FACOPORTI_AQUILES_ACTIONS_TOKEN', VALID_TOKEN)
    vi.stubEnv('SITE_FACOPORTI_AQUILES_ACTIONS_DB_URL', VALID_DB_URL)
    const { route, query } = await loadRoute()

    const response = await route.POST(
      postRequest({ action_type: 'delete_permanent', summary: 'Apagar lead de teste X', payload: { lead_id: '123' } }, VALID_TOKEN) as never
    )
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body).toEqual({ id: 'novo-id', status: 'pending' })
    expect(query).toHaveBeenCalledWith(
      'select public.aquiles_request_action($1, $2, $3) as id',
      ['delete_permanent', 'Apagar lead de teste X', '{"lead_id":"123"}']
    )
  })

  it('GET devolve a lista de ações pending/approved deste perfil, sem parâmetros (identidade é session_user)', async () => {
    vi.stubEnv('SITE_FACOPORTI_AQUILES_ACTIONS_TOKEN', VALID_TOKEN)
    vi.stubEnv('SITE_FACOPORTI_AQUILES_ACTIONS_DB_URL', VALID_DB_URL)
    const { route, query } = await loadRoute(() => Promise.resolve({ rows: [{ actions: [{ id: '1', status: 'pending' }] }] }))

    const response = await route.GET(getRequest(VALID_TOKEN) as never)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.actions).toEqual([{ id: '1', status: 'pending' }])
    expect(query).toHaveBeenCalledWith('select public.aquiles_list_pending() as actions', [])
  })

  it('métodos de escrita não previstos são recusados', async () => {
    const { route } = await loadRoute()
    for (const method of [route.PUT, route.PATCH, route.DELETE]) {
      const response = await method()
      expect(response.status).toBe(405)
      expect(response.headers.get('Allow')).toBe('GET, POST')
    }
  })
})
