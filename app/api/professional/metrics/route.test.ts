import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

function fakeRequest(query: string): NextRequest {
  return { url: `https://façoporti.com/api/professional/metrics${query}` } as unknown as NextRequest
}

function chainable(result: unknown, inSpy?: (args: unknown[]) => void) {
  const obj: Record<string, unknown> = {
    select: () => obj,
    eq: () => obj,
    in: (...args: unknown[]) => { inSpy?.(args); return obj },
    gte: () => obj,
    lte: () => obj,
    maybeSingle: async () => result,
    single: async () => result,
    then: (resolve: (v: unknown) => void) => resolve(result),
  }
  return obj
}

describe('GET /api/professional/metrics', () => {
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
  })

  it('bloqueia utilizador autenticado sem registo de profissional associado', async () => {
    vi.doMock('next/headers', () => ({ cookies: async () => ({ getAll: () => [] }) }))
    vi.doMock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-sem-perfil' } } }) } }) }))
    const from = vi.fn((table: string) => {
      if (table === 'professionals') return chainable({ data: null })
      throw new Error(`tabela inesperada: ${table}`)
    })
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))

    const { GET } = await import('./route')
    const res = await GET(fakeRequest(''))
    expect(res.status).toBe(403)
  })

  it('devolve só as métricas do próprio profissional, ignorando qualquer professional_id no pedido', async () => {
    vi.doMock('next/headers', () => ({ cookies: async () => ({ getAll: () => [] }) }))
    vi.doMock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }) }))

    const inCalls: unknown[][] = []
    const summaryRows = [
      { day: '2026-07-10', professional_id: 'meu-prof-id', event_type: 'page_view', source: 'pessoal', origin_channel: 'direto', event_count: 5, unique_visitors: 4 },
    ]
    const uniqueRows = [{ day: '2026-07-10', professional_id: 'meu-prof-id', unique_visitors: 4 }]

    const from = vi.fn((table: string) => {
      if (table === 'professionals') return chainable({ data: { id: 'meu-prof-id' } })
      if (table === 'analytics_daily_summary') return chainable({ data: summaryRows, error: null }, args => inCalls.push(args))
      if (table === 'analytics_daily_unique_visitors') return chainable({ data: uniqueRows, error: null }, args => inCalls.push(args))
      throw new Error(`tabela inesperada: ${table}`)
    })
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))

    const { GET } = await import('./route')
    // Tentativa de pedir métricas de outro profissional via query string — a rota nem sequer lê este parâmetro
    const res = await GET(fakeRequest('?professional_id=profissional-de-outra-pessoa'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.totals.page_view).toBe(5)
    // As duas chamadas .in('professional_id', [...]) usaram sempre o id da sessão, nunca o da query string
    expect(inCalls).toEqual([
      ['professional_id', ['meu-prof-id']],
      ['professional_id', ['meu-prof-id']],
    ])
    expect(JSON.stringify(json)).not.toContain('profissional-de-outra-pessoa')
  })
})
