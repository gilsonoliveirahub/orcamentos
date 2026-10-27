import { afterEach, describe, expect, it, vi } from 'vitest'

function params(id: string) {
  return { params: Promise.resolve({ id }) }
}

async function loadRoute(opts: {
  admin?: { id: string } | null
  action?: Record<string, unknown> | null
  actionError?: { message: string } | null
  capability?: unknown
}) {
  vi.resetModules()
  vi.doMock('@/lib/admin-auth', () => ({ getAuthenticatedAdmin: vi.fn(async () => (opts.admin === undefined ? { id: 'admin-1' } : opts.admin)) }))
  vi.doMock('@/lib/supabase-admin', () => ({
    supabaseAdmin: {
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: opts.action === undefined ? null : opts.action, error: opts.actionError ?? null }),
          }),
        }),
      })),
    },
  }))
  vi.doMock('@/lib/aquiles-capabilities/registry', () => ({
    getCapability: vi.fn((id: string) => (id === 'fake' ? opts.capability ?? { preview: vi.fn(async () => ({ found: true })) } : null)),
  }))
  const route = await import('./route')
  return route
}

describe('/api/admin/aquiles-actions/[id]/preview', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.doUnmock('@/lib/admin-auth')
    vi.doUnmock('@/lib/supabase-admin')
    vi.doUnmock('@/lib/aquiles-capabilities/registry')
  })

  it('rejeita sem sessão admin', async () => {
    const route = await loadRoute({ admin: null })
    const response = await route.GET(undefined as never, params('a1'))
    expect(response.status).toBe(403)
  })

  it('404 se a ação não existir', async () => {
    const route = await loadRoute({ action: null })
    const response = await route.GET(undefined as never, params('a1'))
    expect(response.status).toBe(404)
  })

  it('devolve preview:null quando o payload não tem capability_id (ex: teste genérico)', async () => {
    const route = await loadRoute({ action: { id: 'a1', payload: { nota: 'teste' } } })
    const response = await route.GET(undefined as never, params('a1'))
    const body = await response.json()
    expect(body.preview).toBeNull()
  })

  it('devolve preview:null com motivo quando a capacidade referida já não existe', async () => {
    const route = await loadRoute({ action: { id: 'a1', payload: { capability_id: 'removida', params: {} } } })
    const response = await route.GET(undefined as never, params('a1'))
    const body = await response.json()
    expect(body.preview).toBeNull()
    expect(body.reason).toMatch(/não existe/)
  })

  it('recalcula o preview a partir do payload gravado (nunca do summary de texto livre)', async () => {
    const previewImpl = vi.fn(async () => ({ found: true, target_summary: 'Lead de Ana', blocked: false, changes: [], effects: [] }))
    const route = await loadRoute({
      action: { id: 'a1', payload: { capability_id: 'fake', params: { lead_id: 'l1' } } },
      capability: { preview: previewImpl },
    })
    const response = await route.GET(undefined as never, params('a1'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(previewImpl).toHaveBeenCalledWith({ lead_id: 'l1' })
    expect(body.preview.target_summary).toBe('Lead de Ana')
  })
})
