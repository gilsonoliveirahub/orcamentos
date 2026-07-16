import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

const ORIGINAL_ENV = { ...process.env }

function fakeRequest(body: unknown): NextRequest {
  return {
    json: async () => body,
    headers: { get: (name: string) => (name === 'user-agent' ? 'Mozilla/5.0 (cliente real)' : name === 'x-forwarded-for' ? '203.0.113.9' : null) },
  } as unknown as NextRequest
}

describe('POST /api/leads/public — registo de request_completed', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env = { ...ORIGINAL_ENV, ANALYTICS_HASH_SECRET: 'segredo-teste' }
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.restoreAllMocks()
    vi.doUnmock('@/lib/supabase-admin')
  })

  it('regista request_completed no servidor, com o professional_id correto, depois de criar o lead com sucesso', async () => {
    const analyticsInserts: Record<string, unknown>[] = []
    const from = vi.fn((table: string) => {
      if (table === 'professionals') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'prof-1', marketplace_credits: 0 } }) }) }) }
      }
      if (table === 'leads') {
        return { insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'lead-1' }, error: null }) }) }) }
      }
      if (table === 'analytics_events') {
        return { insert: (row: Record<string, unknown>) => { analyticsInserts.push(row); return Promise.resolve({ error: null }) } }
      }
      throw new Error(`tabela inesperada: ${table}`)
    })
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ professional_id: 'prof-1', name: 'Cliente', phone: '351911111111', source: 'pessoal' }))

    expect(res.status).toBe(200)
    expect(analyticsInserts).toHaveLength(1)
    expect(analyticsInserts[0]).toMatchObject({ event_type: 'request_completed', professional_id: 'prof-1', source: 'pessoal' })
    // Nunca guarda IP/User-Agent — só o hash
    expect(JSON.stringify(analyticsInserts[0])).not.toContain('203.0.113.9')
    expect(JSON.stringify(analyticsInserts[0])).not.toContain('cliente real')
  })

  it('não regista request_completed quando a criação do lead falha', async () => {
    const analyticsInsert = vi.fn()
    const from = vi.fn((table: string) => {
      if (table === 'professionals') return { select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'prof-1', marketplace_credits: 0 } }) }) }) }
      if (table === 'leads') return { insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: 'falha' } }) }) }) }
      if (table === 'analytics_events') return { insert: analyticsInsert }
      throw new Error(`tabela inesperada: ${table}`)
    })
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ professional_id: 'prof-1', name: 'Cliente', phone: '351911111111' }))

    expect(res.status).toBe(400)
    expect(analyticsInsert).not.toHaveBeenCalled()
  })

  it('marca source: marketplace quando o pedido veio via ?ref=marketplace no /p/[slug]', async () => {
    const analyticsInserts: Record<string, unknown>[] = []
    // Como o marketplace_credits > 0, o código chama .update(...) na tabela
    // professionals antes do insert do lead (dedução atómica de crédito).
    const profFrom = vi.fn(() => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'prof-1', marketplace_credits: 5 } }) }) }),
      update: () => ({ eq: () => ({ eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1' } }) }) }) }) }),
    }))
    const fromCombined = vi.fn((table: string) => {
      if (table === 'professionals') return profFrom()
      if (table === 'leads') return { insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'lead-2' }, error: null }) }) }) }
      if (table === 'analytics_events') return { insert: (row: Record<string, unknown>) => { analyticsInserts.push(row); return Promise.resolve({ error: null }) } }
      throw new Error(`tabela inesperada: ${table}`)
    })
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: fromCombined } }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ professional_id: 'prof-1', name: 'Cliente', phone: '351911111111', source: 'marketplace' }))

    expect(res.status).toBe(200)
    expect(analyticsInserts[0]).toMatchObject({ event_type: 'request_completed', source: 'marketplace' })
  })
})
