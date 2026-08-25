import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

function fakeRequest(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest
}

function mockAuth(userId: string | null) {
  vi.doMock('@/lib/supabase-server', () => ({
    createClient: async () => ({
      auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null } }) },
    }),
  }))
}

describe('POST /api/leads/create', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => {
    vi.restoreAllMocks()
    vi.doUnmock('@/lib/supabase-server')
    vi.doUnmock('@/lib/supabase-admin')
  })

  it('grava source: null e opened_at já preenchido — nunca consome a quota do link pessoal (essa só conta source=\'pessoal\', o DEFAULT da coluna) nem exige abertura via /api/leads/open', async () => {
    mockAuth('user-1')
    let insertPayload: Record<string, unknown> | null = null
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'professionals') return { select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'prof-1' } }) }) }) }
          if (table === 'leads') {
            return {
              insert: (payload: Record<string, unknown>) => {
                insertPayload = payload
                return { select: () => ({ single: async () => ({ data: { id: 'lead-1', ...payload }, error: null }) }) }
              },
            }
          }
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))

    const before = Date.now()
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ name: 'Cliente Manual', phone: '351911111111' }))
    const after = Date.now()
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(insertPayload).toMatchObject({ source: null, professional_id: 'prof-1' })
    expect(insertPayload!.opened_at).toBeTruthy()
    const openedAtMs = new Date(insertPayload!.opened_at as string).getTime()
    expect(openedAtMs).toBeGreaterThanOrEqual(before)
    expect(openedAtMs).toBeLessThanOrEqual(after)
    expect(json.lead.source).toBeNull()
  })
})
