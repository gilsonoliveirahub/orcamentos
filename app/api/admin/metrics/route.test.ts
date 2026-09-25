import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

function fakeRequest(query: string): NextRequest {
  return { url: `https://façoporti.com/api/admin/metrics${query}` } as unknown as NextRequest
}

// Mock "thenable" que suporta encadeamento arbitrário (select/eq/in/gte/lte)
// e também os métodos terminais maybeSingle/single, resolvendo sempre para o
// mesmo resultado fixo — reflete o padrão já usado nos outros testes de rotas.
function chainable(result: unknown) {
  const obj: Record<string, unknown> = {
    select: () => obj,
    eq: () => obj,
    in: () => obj,
    gte: () => obj,
    lte: () => obj,
    lt: () => obj,
    is: () => obj,
    not: () => obj,
    maybeSingle: async () => result,
    single: async () => result,
    then: (resolve: (v: unknown) => void) => resolve(result),
  }
  return obj
}

function mockFrom({
  isAdmin,
  professionals = [],
  summaryRows = [],
  uniqueRows = [],
  nullProfessionalEvents = [],
  utmCampaignEvents = [],
}: {
  isAdmin: boolean
  professionals?: Array<{ id: string; name: string; specialty: string | null; zone: string | null; plan: string | null }>
  summaryRows?: unknown[]
  uniqueRows?: unknown[]
  nullProfessionalEvents?: unknown[]
  utmCampaignEvents?: unknown[]
}) {
  return vi.fn((table: string) => {
    if (table === 'admins') return chainable({ data: isAdmin ? { id: 'admin-row-1' } : null })
    if (table === 'professionals') return chainable({ data: professionals })
    if (table === 'analytics_daily_summary') return chainable({ data: summaryRows, error: null })
    if (table === 'analytics_daily_unique_visitors') return chainable({ data: uniqueRows, error: null })
    // fetchNullProfessionalBucketTotals filtra com .is('professional_id', null);
    // fetchUtmCampaignTotals filtra com .not('utm_campaign', 'is', null) — os
    // dois lêem analytics_events em bruto, por isso precisam de resultados
    // distintos consoante o filtro usado.
    if (table === 'analytics_events') {
      return {
        select: () => ({
          is: () => chainable({ data: nullProfessionalEvents, error: null }),
          not: () => chainable({ data: utmCampaignEvents, error: null }),
        }),
      }
    }
    throw new Error(`tabela inesperada: ${table}`)
  })
}

describe('GET /api/admin/metrics', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => {
    vi.restoreAllMocks()
    vi.doUnmock('@/lib/supabase-admin')
    vi.doUnmock('@supabase/ssr')
    vi.doUnmock('next/headers')
  })

  it('bloqueia quem não está autenticado', async () => {
    vi.doMock('next/headers', () => ({ cookies: async () => ({ getAll: () => [] }) }))
    vi.doMock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) }))
    const from = vi.fn()
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))

    const { GET } = await import('./route')
    const res = await GET(fakeRequest(''))
    expect(res.status).toBe(403)
    expect(from).not.toHaveBeenCalled()
  })

  it('bloqueia utilizador autenticado que não é admin', async () => {
    vi.doMock('next/headers', () => ({ cookies: async () => ({ getAll: () => [] }) }))
    vi.doMock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }) }))
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: mockFrom({ isAdmin: false }) } }))

    const { GET } = await import('./route')
    const res = await GET(fakeRequest(''))
    expect(res.status).toBe(403)
  })

  it('admin recebe totais agregados, incluindo visitantes únicos da plataforma quando sem filtro de profissional', async () => {
    vi.doMock('next/headers', () => ({ cookies: async () => ({ getAll: () => [] }) }))
    vi.doMock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'admin-1' } } }) } }) }))

    const summaryRows = [
      { day: '2026-07-10', professional_id: 'prof-1', event_type: 'page_view', source: 'pessoal', origin_channel: 'instagram', event_count: 10, unique_visitors: 8 },
      { day: '2026-07-10', professional_id: 'prof-1', event_type: 'request_completed', source: 'pessoal', origin_channel: null, event_count: 1, unique_visitors: 1 },
    ]
    const uniqueRows = [{ day: '2026-07-10', professional_id: null, unique_visitors: 15 }]
    const professionals = [{ id: 'prof-1', name: 'Ana', specialty: 'Pintura', zone: 'Lisboa', plan: 'pro' }]
    const nullProfessionalEvents = [
      { event_type: 'page_view', path: '/comecar', visitor_hash: 'v1' },
      { event_type: 'page_view', path: '/', visitor_hash: 'v2' },
    ]
    const utmCampaignEvents = [
      { event_type: 'page_view', utm_campaign: 'lancamento', utm_source: 'facebook', utm_medium: 'cpc', visitor_hash: 'v1' },
      { event_type: 'request_completed', utm_campaign: 'lancamento', utm_source: 'facebook', utm_medium: 'cpc', visitor_hash: 'v1' },
    ]

    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: mockFrom({ isAdmin: true, professionals, summaryRows, uniqueRows, nullProfessionalEvents, utmCampaignEvents }) } }))

    const { GET } = await import('./route')
    const res = await GET(fakeRequest('?from=2026-07-01&to=2026-07-16'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.totals.page_view).toBe(10)
    expect(json.totals.request_completed).toBe(1)
    expect(json.unique_visitors_platform.daily_sum).toBe(15)
    expect(json.by_professional[0].professional_id).toBe('prof-1')
    // Perfis públicos (/p/[slug]) — vêm de analytics_daily_summary, professional_id preenchido
    expect(json.perfis_publicos.page_view).toBe(10)
    // Área profissional vs site — vêm de analytics_events em bruto (professional_id null)
    expect(json.area_profissional.page_view).toBe(1)
    expect(json.site.page_view).toBe(1)
    // Campanhas (utm_campaign) — resultados por anúncio pago
    expect(json.by_utm_campaign).toHaveLength(1)
    expect(json.by_utm_campaign[0]).toMatchObject({ utm_campaign: 'lancamento', page_view: 1, request_completed: 1, conversion_rate: 1 })
    // Nunca expõe visitor_hash, IP ou User-Agent — só números agregados
    expect(JSON.stringify(json)).not.toMatch(/visitor_hash|ip_address|user_agent/i)
  })

  it('quando filtrado por profissional, não devolve o total de visitantes únicos da plataforma inteira', async () => {
    vi.doMock('next/headers', () => ({ cookies: async () => ({ getAll: () => [] }) }))
    vi.doMock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'admin-1' } } }) } }) }))
    const professionals = [{ id: 'prof-1', name: 'Ana', specialty: 'Pintura', zone: 'Lisboa', plan: 'pro' }]
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: mockFrom({ isAdmin: true, professionals, summaryRows: [], uniqueRows: [] }) } }))

    const { GET } = await import('./route')
    const res = await GET(fakeRequest('?professional_id=prof-1'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.unique_visitors_platform).toBeNull()
    // Área profissional/site são sempre da plataforma inteira — nunca fazem
    // sentido filtrados por um profissional específico (ver perfis_publicos
    // e by_professional para a vista por profissional).
    expect(json.area_profissional).toBeNull()
    expect(json.site).toBeNull()
    expect(json.perfis_publicos.unique_visitors).toBeNull()
  })
})
