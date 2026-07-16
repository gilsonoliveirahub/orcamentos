import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

function fakeRequest(body: unknown, contentType: 'application/json' | 'application/x-www-form-urlencoded' = 'application/json'): NextRequest {
  return {
    headers: { get: (name: string) => (name === 'content-type' ? contentType : null) },
    json: async () => body,
    formData: async () => new Map(Object.entries(body as Record<string, string>)) as unknown as FormData,
  } as unknown as NextRequest
}

interface QueryBuilder {
  select: () => QueryBuilder
  eq: () => QueryBuilder
  neq: () => QueryBuilder
  order: () => QueryBuilder
  limit: () => QueryBuilder
  insert: () => QueryBuilder
  update: () => QueryBuilder
  single: () => Promise<{ data: unknown }>
}

function chain(data: unknown): QueryBuilder {
  const builder: QueryBuilder = {
    select: () => builder,
    eq: () => builder,
    neq: () => builder,
    order: () => builder,
    limit: () => builder,
    insert: () => builder,
    update: () => builder,
    single: async () => ({ data }),
  }
  return builder
}

describe('POST /api/webhook/whatsapp', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.doUnmock('@/lib/supabase-admin')
    vi.doUnmock('@/lib/whatsapp')
  })

  it('rejects requests without phone or message with 400, never touching the database', async () => {
    const from = vi.fn()
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))
    const sendWhatsApp = vi.fn()
    vi.doMock('@/lib/whatsapp', () => ({ sendWhatsApp }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ From: 'whatsapp:+351911111111', Body: '' }))

    expect(res.status).toBe(400)
    expect(from).not.toHaveBeenCalled()
    expect(sendWhatsApp).not.toHaveBeenCalled()
  })

  it('creates a new lead and asks for the name on first contact', async () => {
    const professional = { id: 'prof-1', name: 'Gilson', price_m2_walls: 4 }
    const newLead = { id: 'lead-new', phone: '351911111111', current_question: 0 }

    const from = vi.fn((table: string) => {
      if (table === 'leads') {
        // primeira chamada: procurar lead existente -> nenhum encontrado
        // segunda chamada: insert do novo lead, depois update
        return {
          select: () => ({
            eq: () => ({ neq: () => ({ neq: () => ({ order: () => ({ limit: () => ({ single: async () => ({ data: null }) }) }) }) }) }),
          }),
          insert: () => ({ select: () => ({ single: async () => ({ data: newLead }) }) }),
          update: () => ({ eq: async () => ({ data: null }) }),
        }
      }
      if (table === 'professionals') {
        return { select: () => ({ limit: () => ({ single: async () => ({ data: professional }) }) }) }
      }
      return chain(null)
    })
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))

    const sendWhatsApp = vi.fn().mockResolvedValue({ status: 'sent' })
    vi.doMock('@/lib/whatsapp', () => ({ sendWhatsApp }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ From: 'whatsapp:+351911111111', Body: 'Olá' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.response).toContain('Como se chama?')
    expect(sendWhatsApp).toHaveBeenCalledWith('351911111111', expect.stringContaining('Como se chama?'))
  })

  it('still returns success and logs a warning when the WhatsApp reply fails to send', async () => {
    const existingLead = { id: 'lead-1', phone: '351911111111', current_question: 0, professionals: null }

    const from = vi.fn(() => ({
      select: () => ({
        eq: () => ({ neq: () => ({ neq: () => ({ order: () => ({ limit: () => ({ single: async () => ({ data: existingLead }) }) }) }) }) }),
      }),
      update: () => ({ eq: async () => ({ data: null }) }),
    }))
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))

    const sendWhatsApp = vi.fn().mockResolvedValue({ status: 'failed', reason: 'twilio_500' })
    vi.doMock('@/lib/whatsapp', () => ({ sendWhatsApp }))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ From: 'whatsapp:+351911111111', Body: 'Olá' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('resposta não enviada'))
  })

  it('parses Twilio form-encoded payloads, not just JSON', async () => {
    const existingLead = { id: 'lead-1', phone: '351911111111', current_question: 0.5, professionals: null }

    const from = vi.fn(() => ({
      select: () => ({
        eq: () => ({ neq: () => ({ neq: () => ({ order: () => ({ limit: () => ({ single: async () => ({ data: existingLead }) }) }) }) }) }),
      }),
      update: () => ({ eq: async () => ({ data: null }) }),
    }))
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))
    const sendWhatsApp = vi.fn().mockResolvedValue({ status: 'sent' })
    vi.doMock('@/lib/whatsapp', () => ({ sendWhatsApp }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest(
      { From: 'whatsapp:+351911111111', Body: 'Maria Silva' },
      'application/x-www-form-urlencoded'
    ))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.phone).toBe('351911111111')
  })
})
