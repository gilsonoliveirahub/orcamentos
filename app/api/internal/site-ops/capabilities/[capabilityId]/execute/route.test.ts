import { afterEach, describe, expect, it, vi } from 'vitest'

const VALID_TOKEN = 'actions-token-ficticio-com-mais-de-24-caracteres'
const VALID_DB_URL = 'postgresql://site_ops_actions_server.ref:senha-ficticia@aws-1-eu-west-1.pooler.supabase.com:6543/postgres'

async function loadRoute(opts: {
  queryImpl?: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>
  executeImpl?: ReturnType<typeof vi.fn>
  capability?: unknown
}) {
  vi.resetModules()
  const connect = vi.fn().mockResolvedValue(undefined)
  const query = vi.fn(opts.queryImpl ?? (() => Promise.resolve({ rows: [] })))
  const end = vi.fn().mockResolvedValue(undefined)
  const Client = vi.fn(function ClientMock() {
    return { connect, query, end }
  })
  vi.doMock('pg', () => ({ Client }))

  const capability = opts.capability !== undefined
    ? opts.capability
    : { id: 'fake', actionType: 'other_sensitive', execute: opts.executeImpl ?? vi.fn(async () => ({ ok: true })) }
  vi.doMock('@/lib/aquiles-capabilities/registry', () => ({ getCapability: vi.fn((id: string) => (id === 'fake' ? capability : null)) }))

  const route = await import('./route')
  return { route, connect, query, end, Client }
}

function request(body: unknown, token?: string) {
  return new Request('http://localhost/api/internal/site-ops/capabilities/fake/execute', {
    method: 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function params(capabilityId: string) {
  return { params: Promise.resolve({ capabilityId }) }
}

describe('/api/internal/site-ops/capabilities/[capabilityId]/execute', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.doUnmock('pg')
    vi.doUnmock('@/lib/aquiles-capabilities/registry')
  })

  it('rejeita sem token, sem ligar à base', async () => {
    const { route, Client } = await loadRoute({})
    const response = await route.POST(request({ action_id: 'a1', params: {} }) as never, params('fake'))
    expect(response.status).toBe(503)
    expect(Client).not.toHaveBeenCalled()
  })

  it('devolve 404 para capacidade desconhecida', async () => {
    vi.stubEnv('SITE_FACOPORTI_AQUILES_ACTIONS_TOKEN', VALID_TOKEN)
    vi.stubEnv('SITE_FACOPORTI_AQUILES_ACTIONS_DB_URL', VALID_DB_URL)
    const { route } = await loadRoute({})
    const response = await route.POST(request({ action_id: 'a1', params: {} }, VALID_TOKEN) as never, params('inexistente'))
    expect(response.status).toBe(404)
  })

  it('exige action_id', async () => {
    vi.stubEnv('SITE_FACOPORTI_AQUILES_ACTIONS_TOKEN', VALID_TOKEN)
    vi.stubEnv('SITE_FACOPORTI_AQUILES_ACTIONS_DB_URL', VALID_DB_URL)
    const { route } = await loadRoute({})
    const response = await route.POST(request({ params: {} }, VALID_TOKEN) as never, params('fake'))
    expect(response.status).toBe(400)
  })

  it('consome com action_type+payload exatos {capability_id, params}; 409 se a RPC recusar (nunca chega a executar)', async () => {
    vi.stubEnv('SITE_FACOPORTI_AQUILES_ACTIONS_TOKEN', VALID_TOKEN)
    vi.stubEnv('SITE_FACOPORTI_AQUILES_ACTIONS_DB_URL', VALID_DB_URL)
    const executeImpl = vi.fn(async () => ({ ok: true }))
    const { route, query } = await loadRoute({ queryImpl: () => Promise.resolve({ rows: [{ ok: false }] }), executeImpl })

    const response = await route.POST(request({ action_id: 'a1', params: { lead_id: 'l1' } }, VALID_TOKEN) as never, params('fake'))

    expect(response.status).toBe(409)
    expect(executeImpl).not.toHaveBeenCalled()
    expect(query).toHaveBeenCalledWith(
      'select public.aquiles_consume_approved_action($1, $2, $3) as ok',
      ['a1', 'other_sensitive', JSON.stringify({ capability_id: 'fake', params: { lead_id: 'l1' } })]
    )
  })

  it('sucesso: consome, executa, regista resultado true e devolve executed', async () => {
    vi.stubEnv('SITE_FACOPORTI_AQUILES_ACTIONS_TOKEN', VALID_TOKEN)
    vi.stubEnv('SITE_FACOPORTI_AQUILES_ACTIONS_DB_URL', VALID_DB_URL)
    const executeImpl = vi.fn(async () => ({ feito: true }))
    const recordedResults: Array<{ success: unknown }> = []
    const queryImpl = (sql: string, queryParams?: unknown[]) => {
      if (sql.includes('aquiles_consume_approved_action')) return Promise.resolve({ rows: [{ ok: true }] })
      if (sql.includes('aquiles_get_action')) return Promise.resolve({ rows: [{ action: { decided_by: 'admin-1' } }] })
      if (sql.includes('aquiles_record_execution_result')) {
        recordedResults.push({ success: queryParams?.[1] })
        return Promise.resolve({ rows: [{ ok: true }] })
      }
      throw new Error(`query inesperada: ${sql}`)
    }
    const { route } = await loadRoute({ queryImpl, executeImpl })

    const response = await route.POST(request({ action_id: 'a1', params: { lead_id: 'l1' } }, VALID_TOKEN) as never, params('fake'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ id: 'a1', status: 'executed', result: { feito: true } })
    expect(executeImpl).toHaveBeenCalledWith({ lead_id: 'l1' }, { actionId: 'a1', approvedByAdminId: 'admin-1' })
    expect(recordedResults).toEqual([{ success: true }])
  })

  it('falha real na execução: regista failed (nunca executed) e devolve o motivo', async () => {
    vi.stubEnv('SITE_FACOPORTI_AQUILES_ACTIONS_TOKEN', VALID_TOKEN)
    vi.stubEnv('SITE_FACOPORTI_AQUILES_ACTIONS_DB_URL', VALID_DB_URL)
    const executeImpl = vi.fn(async () => { throw new Error('profissional sem créditos') })
    const recordedResults: Array<{ success: unknown; result: unknown }> = []
    const queryImpl = (sql: string, queryParams?: unknown[]) => {
      if (sql.includes('aquiles_consume_approved_action')) return Promise.resolve({ rows: [{ ok: true }] })
      if (sql.includes('aquiles_get_action')) return Promise.resolve({ rows: [{ action: { decided_by: 'admin-1' } }] })
      if (sql.includes('aquiles_record_execution_result')) {
        recordedResults.push({ success: queryParams?.[1], result: queryParams?.[2] })
        return Promise.resolve({ rows: [{ ok: true }] })
      }
      throw new Error(`query inesperada: ${sql}`)
    }
    const { route } = await loadRoute({ queryImpl, executeImpl })

    const response = await route.POST(request({ action_id: 'a1', params: {} }, VALID_TOKEN) as never, params('fake'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ id: 'a1', status: 'failed', error: 'profissional sem créditos' })
    expect(recordedResults).toEqual([{ success: false, result: JSON.stringify({ error: 'profissional sem créditos' }) }])
  })

  it('métodos não previstos são recusados', async () => {
    const { route } = await loadRoute({})
    for (const method of [route.GET, route.PUT, route.PATCH, route.DELETE]) {
      const response = await method()
      expect(response.status).toBe(405)
    }
  })
})
