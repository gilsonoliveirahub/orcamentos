import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const leads = [
  { status: 'fechado', updated_at: '2026-01-15T00:00:00Z', created_at: '2026-01-10T00:00:00Z', valor_fechado: 300 },
  { status: 'fechado', updated_at: '2026-02-01T00:00:00Z', created_at: '2026-01-25T00:00:00Z', valor_fechado: 500 },
  { status: 'perdido', updated_at: '2026-01-20T00:00:00Z', created_at: '2026-01-01T00:00:00Z', valor_fechado: null },
]

describe('GET /api/admin/financials', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => { vi.restoreAllMocks(); vi.doUnmock('@/lib/admin-auth'); vi.doUnmock('@/lib/supabase-admin') })

  function mockDeps({ isAdmin = true } = {}) {
    vi.doMock('@/lib/admin-auth', () => ({ getAuthenticatedAdmin: async () => (isAdmin ? { id: 'admin-1' } : null) }))
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: { from: () => ({ select: async () => ({ data: leads, error: null }) }) },
    }))
  }

  it('bloqueia quem não é admin', async () => {
    mockDeps({ isAdmin: false })
    const { GET } = await import('./route')
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('devolve valor económico real gerado aos profissionais, evolução mensal, e marca receita da plataforma como indisponível', async () => {
    mockDeps()
    const { GET } = await import('./route')
    const res = await GET()
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.professionalValue.total).toBe(800)
    expect(json.professionalValue.ticketMedio).toBe(400)
    expect(json.professionalValue.byMonth).toEqual([
      { month: '2026-01', total: 300, count: 1 },
      { month: '2026-02', total: 500, count: 1 },
    ])

    // Nunca usar valor_fechado como receita da FaçoPorTi.
    expect(json.platformRevenue.available).toBe(false)
    expect(json.platformRevenue.reason).toBeTruthy()
    expect(JSON.stringify(json.platformRevenue)).not.toMatch(/800|400/)
  })
})
