import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

function fakeRequest(query: string): NextRequest {
  return { url: `https://façoporti.com/api/admin/search${query}` } as unknown as NextRequest
}

describe('GET /api/admin/search', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => { vi.restoreAllMocks(); vi.doUnmock('@/lib/admin-auth'); vi.doUnmock('@/lib/supabase-admin') })

  const professionals = [{ id: 'p1', name: 'Ana Pintora', email: 'ana@x.com', slug: 'ana' }]
  const leadsForClients = [
    { id: 'l1', phone: '351911111111', name: 'Ana Cliente', email: null, status: 'fechado', source: 'pessoal', valor_fechado: 300, created_at: '2026-01-01T00:00:00Z', professional_id: 'p1', professionals: { name: 'Ana Pintora' } },
  ]
  const leadsDirect = [{ id: 'l1', name: 'Ana Cliente', phone: '351911111111', status: 'fechado', created_at: '2026-01-01T00:00:00Z' }]

  function mockDeps({ isAdmin = true } = {}) {
    let orCallCount = 0
    vi.doMock('@/lib/admin-auth', () => ({ getAuthenticatedAdmin: async () => (isAdmin ? { id: 'admin-1' } : null) }))
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'professionals') return { select: () => ({ or: () => ({ limit: async () => ({ data: professionals, error: null }) }) }) }
          if (table === 'leads') {
            orCallCount += 1
            const isDirectQuery = orCallCount > 1 // 2ª chamada a 'leads' é a de resultados diretos, com order+limit
            if (isDirectQuery) return { select: () => ({ or: () => ({ order: () => ({ limit: async () => ({ data: leadsDirect, error: null }) }) }) }) }
            return { select: () => ({ or: async () => ({ data: leadsForClients, error: null }) }) }
          }
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))
  }

  it('bloqueia quem não é admin', async () => {
    mockDeps({ isAdmin: false })
    const { GET } = await import('./route')
    const res = await GET(fakeRequest('?q=ana'))
    expect(res.status).toBe(403)
  })

  it('termo com menos de 2 caracteres: devolve tudo vazio, sem consultar a BD', async () => {
    mockDeps()
    const { GET } = await import('./route')
    const res = await GET(fakeRequest('?q=a'))
    const json = await res.json()
    expect(json).toEqual({ professionals: [], clients: [], leads: [] })
  })

  it('pesquisa profissionais, clientes derivados e leads em paralelo', async () => {
    mockDeps()
    const { GET } = await import('./route')
    const res = await GET(fakeRequest('?q=ana'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.professionals).toEqual(professionals)
    expect(json.clients).toHaveLength(1)
    expect(json.clients[0].phone).toBe('351911111111')
    expect(json.leads).toEqual(leadsDirect)
  })
})
