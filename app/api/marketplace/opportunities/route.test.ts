import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('GET /api/marketplace/opportunities', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => {
    vi.restoreAllMocks()
    vi.doUnmock('@/lib/supabase-admin')
    vi.doUnmock('@supabase/ssr')
    vi.doUnmock('next/headers')
    vi.doUnmock('@/lib/marketplace')
  })

  it('bloqueia quem não está autenticado', async () => {
    vi.doMock('next/headers', () => ({ cookies: async () => ({ getAll: () => [] }) }))
    vi.doMock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) }))
    const listMarketplaceOpportunities = vi.fn()
    vi.doMock('@/lib/marketplace', () => ({ listMarketplaceOpportunities }))
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: vi.fn() } }))

    const { GET } = await import('./route')
    const res = await GET()
    expect(res.status).toBe(403)
    expect(listMarketplaceOpportunities).not.toHaveBeenCalled()
  })

  it('devolve as oportunidades do profissional autenticado', async () => {
    vi.doMock('next/headers', () => ({ cookies: async () => ({ getAll: () => [] }) }))
    vi.doMock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }) }))
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1' } }) }) }) }) },
    }))
    const opportunities = [{ id: 'lead-1', specialty: 'Pintura', zone_requested: 'Lisboa', created_at: '2026-07-16', distance_km: 5, distance_label: 'aproximadamente 5 km' }]
    const listMarketplaceOpportunities = vi.fn().mockResolvedValue(opportunities)
    vi.doMock('@/lib/marketplace', () => ({ listMarketplaceOpportunities }))

    const { GET } = await import('./route')
    const res = await GET()
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.opportunities).toEqual(opportunities)
    expect(listMarketplaceOpportunities).toHaveBeenCalledWith('prof-1')
  })
})
