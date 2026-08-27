import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('buildReliabilityScores', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => { vi.restoreAllMocks(); vi.doUnmock('@/lib/supabase-admin') })

  it('agrega score/total/active_count/conversion_rate/avg_response_hours por profissional', async () => {
    const leads = [
      { professional_id: 'prof-a', status: 'fechado', created_at: '2026-01-01T00:00:00Z', opened_at: '2026-01-01T02:00:00Z' },
      { professional_id: 'prof-a', status: 'perdido', created_at: '2026-01-02T00:00:00Z', opened_at: null },
      { professional_id: 'prof-b', status: 'novo', created_at: '2020-01-01T00:00:00Z', opened_at: null },
    ]
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: { from: () => ({ select: () => ({ not: async () => ({ data: leads, error: null }) }) }) },
    }))

    const { buildReliabilityScores } = await import('./professional-reliability-scores')
    const scores = await buildReliabilityScores()

    expect(scores['prof-a']).toEqual({ score: 1, total: 2, active_count: 0, conversion_rate: 0.5, avg_response_hours: 2 })
    expect(scores['prof-b']).toEqual({ score: 0, total: 1, active_count: 1, conversion_rate: 1, avg_response_hours: null })
  })

  it('propaga o erro do Supabase em vez de o esconder (nunca devolve scores parciais silenciosamente)', async () => {
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: { from: () => ({ select: () => ({ not: async () => ({ data: null, error: { message: 'falha' } }) }) }) },
    }))

    const { buildReliabilityScores } = await import('./professional-reliability-scores')
    await expect(buildReliabilityScores()).rejects.toThrow('falha')
  })

  it('sem leads: devolve objeto vazio', async () => {
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: { from: () => ({ select: () => ({ not: async () => ({ data: [], error: null }) }) }) },
    }))

    const { buildReliabilityScores } = await import('./professional-reliability-scores')
    expect(await buildReliabilityScores()).toEqual({})
  })
})
