import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'
import { generateProfessionalOptOutToken, generateClientOptOutToken } from '@/lib/optout'

const ORIGINAL_ENV = { ...process.env }
const SECRET = 'segredo-teste'

function fakeRequest(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest
}

describe('POST /api/opt-out (profissionais)', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env = { ...ORIGINAL_ENV, EMAIL_OPTOUT_SECRET: SECRET }
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.restoreAllMocks()
    vi.doUnmock('@/lib/supabase-admin')
  })

  it('rejects a request missing professional_id or token', async () => {
    const update = vi.fn()
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: () => ({ update: () => ({ eq: update }) }) } }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ token: 'abc' }))
    expect(res.status).toBe(400)
    expect(update).not.toHaveBeenCalled()
  })

  it('rejects an invalid/forged token', async () => {
    const eq = vi.fn()
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: () => ({ update: () => ({ eq }) }) } }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ professional_id: 'prof-1', token: 'a'.repeat(64) }))
    expect(res.status).toBe(403)
    expect(eq).not.toHaveBeenCalled()
  })

  it('a client-namespaced token is never accepted here, even for the same underlying value', async () => {
    const eq = vi.fn()
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: () => ({ update: () => ({ eq }) }) } }))

    const clientToken = generateClientOptOutToken('prof-1', SECRET) // valor igual, namespace errado
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ professional_id: 'prof-1', token: clientToken }))

    expect(res.status).toBe(403)
    expect(eq).not.toHaveBeenCalled()
  })

  it('accepts a valid token and turns off marketing_opt_in for that professional', async () => {
    const updatePayloads: Record<string, unknown>[] = []
    const eqCalls: Array<[string, string]> = []
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: () => ({
          update: (payload: Record<string, unknown>) => {
            updatePayloads.push(payload)
            return { eq: (col: string, value: string) => { eqCalls.push([col, value]); return Promise.resolve({ error: null }) } }
          },
        }),
      },
    }))

    const token = generateProfessionalOptOutToken('prof-1', SECRET)
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ professional_id: 'prof-1', token }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(updatePayloads[0]).toEqual({ marketing_opt_in: false })
    expect(eqCalls[0]).toEqual(['id', 'prof-1'])
  })
})
