import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'
import { generateClientOptOutToken } from '@/lib/optout'

const ORIGINAL_ENV = { ...process.env }
const SECRET = 'segredo-teste'

function fakeRequest(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest
}

describe('POST /api/marketing/opt-out', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env = { ...ORIGINAL_ENV, EMAIL_OPTOUT_SECRET: SECRET }
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.restoreAllMocks()
    vi.doUnmock('@/lib/supabase-admin')
  })

  it('rejects a request missing email or token', async () => {
    const upsert = vi.fn()
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: () => ({ upsert }) } }))

    const { POST } = await import('./route')
    const res1 = await POST(fakeRequest({ token: 'abc' }))
    const res2 = await POST(fakeRequest({ email: 'cliente@example.com' }))

    expect(res1.status).toBe(400)
    expect(res2.status).toBe(400)
    expect(upsert).not.toHaveBeenCalled()
  })

  it('rejects an invalid/forged token', async () => {
    const upsert = vi.fn()
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: () => ({ upsert }) } }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ email: 'cliente@example.com', token: 'a'.repeat(64) }))

    expect(res.status).toBe(403)
    expect(upsert).not.toHaveBeenCalled()
  })

  it('accepts a valid token and records the opt-out, normalizing the email', async () => {
    const upsertCalls: Array<[Record<string, unknown>, Record<string, unknown>]> = []
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: () => ({
          upsert: (payload: Record<string, unknown>, opts: Record<string, unknown>) => { upsertCalls.push([payload, opts]); return Promise.resolve({ error: null }) },
        }),
      },
    }))

    const token = generateClientOptOutToken('cliente@example.com', SECRET)
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ email: 'Cliente@Example.com', token }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(upsertCalls[0][0]).toMatchObject({ email: 'cliente@example.com', opted_in: false })
    expect(upsertCalls[0][1]).toEqual({ onConflict: 'email' })
  })

  it('returns 500 without configuring the secret in error responses (never leaks the secret)', async () => {
    delete process.env.EMAIL_OPTOUT_SECRET
    const upsert = vi.fn()
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: () => ({ upsert }) } }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ email: 'cliente@example.com', token: 'a'.repeat(64) }))
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(JSON.stringify(json)).not.toContain(SECRET)
    expect(upsert).not.toHaveBeenCalled()
  })
})
