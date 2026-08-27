import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const now = new Date()
const oldIso = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString()

const professionals = [
  { id: 'p1', name: 'Ana', specialty: 'Pintura', plan: 'pro', trial_ends_at: null, created_at: '2020-01-01T00:00:00Z' },
  { id: 'p2', name: 'Bruno', specialty: 'Jardinagem', plan: 'free', trial_ends_at: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString(), created_at: '2021-01-01T00:00:00Z' },
]

const leads = [
  { id: 'l1', name: 'C1', status: 'novo', source: 'pessoal', specialty: 'Pintura', zone_requested: 'Lisboa', valor_fechado: null, created_at: now.toISOString(), opened_at: null, professional_id: 'p1', professionals: { name: 'Ana' } },
  { id: 'l2', name: 'C2', status: 'qualificado', source: 'pessoal', specialty: 'Pintura', zone_requested: 'Lisboa', valor_fechado: null, created_at: now.toISOString(), opened_at: null, professional_id: 'p1', professionals: { name: 'Ana' } },
  { id: 'l3', name: 'C3', status: 'fechado', source: 'pessoal', specialty: 'Pintura', zone_requested: 'Lisboa', valor_fechado: 500, created_at: now.toISOString(), opened_at: now.toISOString(), professional_id: 'p1', professionals: { name: 'Ana' } },
  { id: 'l4', name: 'C4', status: 'perdido', source: 'pessoal', specialty: 'Jardinagem', zone_requested: 'Porto', valor_fechado: null, created_at: now.toISOString(), opened_at: now.toISOString(), professional_id: 'p2', professionals: { name: 'Bruno' } },
  { id: 'l5', name: 'C5', status: 'novo', source: 'pessoal', specialty: 'Jardinagem', zone_requested: 'Porto', valor_fechado: null, created_at: oldIso, opened_at: null, professional_id: 'p2', professionals: { name: 'Bruno' } },
]

describe('GET /api/admin/overview', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => { vi.restoreAllMocks(); vi.doUnmock('@/lib/admin-auth'); vi.doUnmock('@/lib/supabase-admin') })

  function mockDeps({ isAdmin = true, quotesError = false }: { isAdmin?: boolean; quotesError?: boolean } = {}) {
    vi.doMock('@/lib/admin-auth', () => ({ getAuthenticatedAdmin: async () => (isAdmin ? { id: 'admin-1' } : null) }))
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'professionals') return { select: async () => ({ data: professionals, error: null }) }
          if (table === 'leads') return { select: () => ({ order: async () => ({ data: leads, error: null }) }) }
          if (table === 'quotes') return { select: async () => (quotesError ? { data: null, error: { message: 'falha' } } : { data: [], error: null }) }
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))
  }

  it('bloqueia quem não é admin', async () => {
    mockDeps({ isAdmin: false })
    const { GET } = await import('./route')
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('devolve 500 se alguma das 3 leituras falhar (não mistura com sucesso silencioso)', async () => {
    mockDeps({ quotesError: true })
    const { GET } = await import('./route')
    const res = await GET()
    expect(res.status).toBe(500)
  })

  it('agrega profissionais por plano efetivo, funil de negócio, valor real e alertas', async () => {
    mockDeps()
    const { GET } = await import('./route')
    const res = await GET()
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.professionals.total).toBe(2)
    expect(json.professionals.byPlan).toEqual({ free: 0, trial: 1, starter: 0, pro: 1, inactive: 0 })

    expect(json.business).toEqual({
      totalLeads: 5, leadsHoje: 4, novos: 2, emCurso: 1, propostas: 0, fechados: 1, perdidos: 1,
      taxaFecho: 0.5, // 1 fechado / (1 fechado + 1 perdido)
    })

    expect(json.value.valorFechadoReal).toBe(500)
    expect(json.value.ticketMedio).toBe(500)

    expect(json.alerts.trialsEndingSoon).toEqual([{ id: 'p2', name: 'Bruno', trial_ends_at: professionals[1].trial_ends_at }])
    expect(json.alerts.abandonedLeadsCount).toBe(1) // l5, 'novo' há 60 dias

    expect(json.recentLeads).toHaveLength(5)
    expect(json.recentLeads[0].professional_name).toBe('Ana')
  })
})
