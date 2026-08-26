import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('GET /api/professionals/reliability', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => { vi.restoreAllMocks(); vi.doUnmock('@/lib/supabase-admin') })

  it('agrega por profissional e nunca devolve dados de lead (score/total/active_count/conversion_rate/avg_response_hours)', async () => {
    const leads = [
      { professional_id: 'prof-a', status: 'fechado', created_at: '2026-01-01T00:00:00Z', opened_at: '2026-01-01T02:00:00Z' },
      { professional_id: 'prof-a', status: 'perdido', created_at: '2026-01-02T00:00:00Z', opened_at: null },
      { professional_id: 'prof-b', status: 'novo', created_at: '2020-01-01T00:00:00Z', opened_at: null }, // antigo, nunca resolvido -> abandonado (mas ainda "ativo" para capacidade)
    ]
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: { from: () => ({ select: () => ({ not: async () => ({ data: leads, error: null }) }) }) },
    }))

    const { GET } = await import('./route')
    const res = await GET()
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.scores['prof-a']).toEqual({ score: 1, total: 2, active_count: 0, conversion_rate: 0.5, avg_response_hours: 2 })
    expect(json.scores['prof-b']).toEqual({ score: 0, total: 1, active_count: 1, conversion_rate: 1, avg_response_hours: null })
    // nunca deve haver nomes/telefones/status individuais na resposta
    expect(JSON.stringify(json)).not.toMatch(/status|created_at/)
  })

  it('sem leads: devolve objeto de scores vazio, sem erro', async () => {
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: { from: () => ({ select: () => ({ not: async () => ({ data: [], error: null }) }) }) },
    }))

    const { GET } = await import('./route')
    const res = await GET()
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.scores).toEqual({})
  })

  it('erro do Supabase: devolve 500 em vez de rebentar', async () => {
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: { from: () => ({ select: () => ({ not: async () => ({ data: null, error: { message: 'falha' } }) }) }) },
    }))

    const { GET } = await import('./route')
    const res = await GET()
    expect(res.status).toBe(500)
  })
})
