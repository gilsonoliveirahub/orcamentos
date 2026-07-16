import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

const ORIGINAL_ENV = { ...process.env }

function fakeRequest(authHeader?: string): NextRequest {
  return {
    headers: { get: (name: string) => (name === 'authorization' && authHeader ? authHeader : null) },
  } as unknown as NextRequest
}

function mockSupabase() {
  const rpcCalls: Array<{ fn: string; args: unknown }> = []
  const deleteCalls: Array<{ table: string; column: string; cutoff: string }> = []
  const rpc = vi.fn(async (fn: string, args: unknown) => {
    rpcCalls.push({ fn, args })
    return { error: null }
  })
  const from = vi.fn((table: string) => ({
    delete: () => ({
      lt: async (column: string, cutoff: string) => {
        deleteCalls.push({ table, column, cutoff })
        return { error: null, count: table === 'analytics_events' ? 42 : 3 }
      },
    }),
  }))
  vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { rpc, from } }))
  return { rpc, from, rpcCalls, deleteCalls }
}

describe('GET /api/cron/analytics', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env = { ...ORIGINAL_ENV }
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.restoreAllMocks()
    vi.doUnmock('@/lib/supabase-admin')
  })

  it('bloqueia quando CRON_SECRET não está configurado, mesmo com um cabeçalho enviado — nunca corre sem proteção', async () => {
    delete process.env.CRON_SECRET
    const { rpc, from } = mockSupabase()

    const { GET } = await import('./route')
    const res = await GET(fakeRequest('Bearer qualquer-coisa'))

    expect(res.status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
    expect(from).not.toHaveBeenCalled()
  })

  it('bloqueia quando o token não corresponde ao CRON_SECRET', async () => {
    process.env.CRON_SECRET = 'segredo-correto'
    const { rpc } = mockSupabase()

    const { GET } = await import('./route')
    const res = await GET(fakeRequest('Bearer segredo-errado'))

    expect(res.status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('com o segredo correto, agrega o dia anterior e aplica retenção (90 dias eventos, 24 meses agregados)', async () => {
    process.env.CRON_SECRET = 'segredo-correto'
    const { rpc, rpcCalls, deleteCalls } = mockSupabase()

    const { GET } = await import('./route')
    const res = await GET(fakeRequest('Bearer segredo-correto'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(rpc).toHaveBeenCalledWith('aggregate_analytics_day', expect.objectContaining({ target_day: expect.any(String) }))
    expect(rpc).toHaveBeenCalledWith('aggregate_analytics_unique_visitors_day', expect.objectContaining({ target_day: expect.any(String) }))
    // As duas funções de agregação recebem sempre o mesmo dia-alvo (ontem)
    expect(rpcCalls[0].args).toEqual(rpcCalls[1].args)

    const tables = deleteCalls.map(d => d.table)
    expect(tables).toContain('analytics_events')
    expect(tables).toContain('analytics_daily_summary')
    expect(tables).toContain('analytics_daily_unique_visitors')
    expect(deleteCalls.find(d => d.table === 'analytics_events')?.column).toBe('created_at')
    expect(deleteCalls.find(d => d.table === 'analytics_daily_summary')?.column).toBe('day')

    expect(json.events_deleted).toBe(42)
    expect(json.summary_deleted).toBe(3)
    expect(json.unique_visitors_deleted).toBe(3)
  })

  it('é determinístico: duas execuções seguidas pedem a agregação para o mesmo dia-alvo (idempotência garantida pela função SQL de DELETE+INSERT, ver supabase/migration_analytics.sql)', async () => {
    process.env.CRON_SECRET = 'segredo-correto'
    const { rpcCalls } = mockSupabase()

    const { GET } = await import('./route')
    await GET(fakeRequest('Bearer segredo-correto'))
    await GET(fakeRequest('Bearer segredo-correto'))

    const firstRunDay = rpcCalls[0].args
    const secondRunDay = rpcCalls[2].args
    expect(firstRunDay).toEqual(secondRunDay)
  })

  it('a data-alvo é sempre o dia anterior (não o próprio dia da execução)', async () => {
    process.env.CRON_SECRET = 'segredo-correto'
    const { rpcCalls } = mockSupabase()

    const { GET } = await import('./route')
    await GET(fakeRequest('Bearer segredo-correto'))

    const targetDay = (rpcCalls[0].args as { target_day: string }).target_day
    const expectedYesterday = new Date()
    expectedYesterday.setUTCDate(expectedYesterday.getUTCDate() - 1)
    expect(targetDay).toBe(expectedYesterday.toISOString().slice(0, 10))
  })
})
