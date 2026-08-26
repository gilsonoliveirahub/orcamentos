import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

function fakeRequest(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest
}

describe('POST /api/marketplace/acquire', () => {
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
    const acquireMarketplaceLead = vi.fn()
    vi.doMock('@/lib/marketplace', () => ({ acquireMarketplaceLead }))
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: vi.fn() } }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1' }))
    expect(res.status).toBe(403)
    expect(acquireMarketplaceLead).not.toHaveBeenCalled()
  })

  it('rejeita pedido sem lead_id', async () => {
    vi.doMock('next/headers', () => ({ cookies: async () => ({ getAll: () => [] }) }))
    vi.doMock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }) }))
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1' } }) }) }) }) },
    }))
    const acquireMarketplaceLead = vi.fn()
    vi.doMock('@/lib/marketplace', () => ({ acquireMarketplaceLead }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({}))
    expect(res.status).toBe(400)
    expect(acquireMarketplaceLead).not.toHaveBeenCalled()
  })

  it('devolve 200 numa aquisição com sucesso, usando sempre o professionalId da sessão', async () => {
    vi.doMock('next/headers', () => ({ cookies: async () => ({ getAll: () => [] }) }))
    vi.doMock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }) }))
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1' } }) }) }) }) },
    }))
    const acquireMarketplaceLead = vi.fn().mockResolvedValue({ ok: true, leadId: 'lead-1' })
    vi.doMock('@/lib/marketplace', () => ({ acquireMarketplaceLead }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1', professional_id: 'tentativa-de-outro-prof' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual({ ok: true, lead_id: 'lead-1' })
    // O professionalId usado é sempre o da sessão — o campo enviado no corpo é ignorado
    expect(acquireMarketplaceLead).toHaveBeenCalledWith({ leadId: 'lead-1', professionalId: 'prof-1' })
  })

  async function expectStatusForError(error: string, expectedStatus: number) {
    vi.resetModules()
    vi.doMock('next/headers', () => ({ cookies: async () => ({ getAll: () => [] }) }))
    vi.doMock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }) }))
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1' } }) }) }) }) },
    }))
    vi.doMock('@/lib/marketplace', () => ({ acquireMarketplaceLead: vi.fn().mockResolvedValue({ ok: false, error }) }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1' }))
    expect(res.status).toBe(expectedStatus)
  }

  it('erro "plan" devolve 402', () => expectStatusForError('plan', 402))
  it('erro "credits" devolve 402', () => expectStatusForError('credits', 402))
  it('erro "taken" devolve 409 (conflito — já adquirido por outro)', () => expectStatusForError('taken', 409))
  it('erro "not_found" devolve 404', () => expectStatusForError('not_found', 404))
  it('erro "unavailable" (profissional em pausa) devolve 403', () => expectStatusForError('unavailable', 403))
})
