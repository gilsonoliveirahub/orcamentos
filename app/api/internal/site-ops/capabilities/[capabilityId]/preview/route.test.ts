import { afterEach, describe, expect, it, vi } from 'vitest'

const VALID_TOKEN = 'actions-token-ficticio-com-mais-de-24-caracteres'
const VALID_DB_URL = 'postgresql://site_ops_actions_server.ref:senha-ficticia@aws-1-eu-west-1.pooler.supabase.com:6543/postgres'

async function loadRoute(opts: { previewImpl?: ReturnType<typeof vi.fn>; capability?: unknown } = {}) {
  vi.resetModules()
  const capability = opts.capability !== undefined
    ? opts.capability
    : { id: 'fake', actionType: 'other_sensitive', preview: opts.previewImpl ?? vi.fn(async () => ({ found: true })) }
  vi.doMock('@/lib/aquiles-capabilities/registry', () => ({ getCapability: vi.fn((id: string) => (id === 'fake' ? capability : null)) }))
  const route = await import('./route')
  return route
}

function request(body: unknown, token?: string) {
  return new Request('http://localhost/api/internal/site-ops/capabilities/fake/preview', {
    method: 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function params(capabilityId: string) {
  return { params: Promise.resolve({ capabilityId }) }
}

describe('/api/internal/site-ops/capabilities/[capabilityId]/preview', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.doUnmock('@/lib/aquiles-capabilities/registry')
  })

  it('rejeita sem token no pedido quando o servidor já tem credencial configurada', async () => {
    vi.stubEnv('SITE_FACOPORTI_AQUILES_ACTIONS_TOKEN', VALID_TOKEN)
    vi.stubEnv('SITE_FACOPORTI_AQUILES_ACTIONS_DB_URL', VALID_DB_URL)
    const route = await loadRoute()
    const response = await route.POST(request({ params: {} }) as never, params('fake'))
    expect(response.status).toBe(403)
  })

  it('rejeita quando o servidor nem tem a credencial configurada', async () => {
    const route = await loadRoute()
    const response = await route.POST(request({ params: {} }) as never, params('fake'))
    expect(response.status).toBe(503)
  })

  it('devolve 404 para uma capacidade desconhecida', async () => {
    vi.stubEnv('SITE_FACOPORTI_AQUILES_ACTIONS_TOKEN', VALID_TOKEN)
    vi.stubEnv('SITE_FACOPORTI_AQUILES_ACTIONS_DB_URL', VALID_DB_URL)
    const route = await loadRoute()
    const response = await route.POST(request({ params: {} }, VALID_TOKEN) as never, params('inexistente'))
    expect(response.status).toBe(404)
  })

  it('chama capability.preview com os params do corpo e devolve o resultado', async () => {
    vi.stubEnv('SITE_FACOPORTI_AQUILES_ACTIONS_TOKEN', VALID_TOKEN)
    vi.stubEnv('SITE_FACOPORTI_AQUILES_ACTIONS_DB_URL', VALID_DB_URL)
    const previewImpl = vi.fn(async () => ({ found: true, blocked: false }))
    const route = await loadRoute({ previewImpl })

    const response = await route.POST(request({ params: { lead_id: 'l1' } }, VALID_TOKEN) as never, params('fake'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(previewImpl).toHaveBeenCalledWith({ lead_id: 'l1' })
    expect(body).toEqual({ preview: { found: true, blocked: false } })
  })

  it('devolve 500 se a capacidade rebentar a calcular o preview', async () => {
    vi.stubEnv('SITE_FACOPORTI_AQUILES_ACTIONS_TOKEN', VALID_TOKEN)
    vi.stubEnv('SITE_FACOPORTI_AQUILES_ACTIONS_DB_URL', VALID_DB_URL)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const route = await loadRoute({ previewImpl: vi.fn(async () => { throw new Error('falhou') }) })

    const response = await route.POST(request({ params: {} }, VALID_TOKEN) as never, params('fake'))
    expect(response.status).toBe(500)
  })

  it('métodos não previstos são recusados', async () => {
    const route = await loadRoute()
    for (const method of [route.GET, route.PUT, route.PATCH, route.DELETE]) {
      const response = await method()
      expect(response.status).toBe(405)
    }
  })
})
