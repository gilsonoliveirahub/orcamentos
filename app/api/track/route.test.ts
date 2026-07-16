import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

const ORIGINAL_ENV = { ...process.env }

function fakeRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  const defaultHeaders: Record<string, string> = { 'user-agent': 'Mozilla/5.0 (real browser)', ...headers }
  return {
    json: async () => body,
    headers: { get: (name: string) => defaultHeaders[name.toLowerCase()] ?? null },
  } as unknown as NextRequest
}

describe('POST /api/track', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env = { ...ORIGINAL_ENV, ANALYTICS_HASH_SECRET: 'segredo-teste' }
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.restoreAllMocks()
    vi.doUnmock('@/lib/supabase-admin')
  })

  function mockSupabase({ professional = null, insertError = null }: { professional?: { id: string } | null; insertError?: { message: string } | null } = {}) {
    const insertedRows: Record<string, unknown>[] = []
    const from = vi.fn((table: string) => {
      if (table === 'professionals') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: professional }) }) }) }
      }
      if (table === 'analytics_events') {
        return {
          select: () => ({ eq: () => ({ gte: async () => ({ count: 0 }) }) }),
          insert: (row: Record<string, unknown>) => { insertedRows.push(row); return Promise.resolve({ error: insertError }) },
        }
      }
      throw new Error(`tabela inesperada: ${table}`)
    })
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))
    return { insertedRows, from }
  }

  it('rejects an event_type outside the whitelist', async () => {
    mockSupabase()
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ event_type: 'fake_event', path: '/' }))
    expect(res.status).toBe(400)
  })

  it('rejects request_completed — só o servidor pode registar este evento', async () => {
    mockSupabase()
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ event_type: 'request_completed', path: '/p/gilson-oliveira' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('servidor')
  })

  it('rejects a path outside the whitelist', async () => {
    mockSupabase()
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ event_type: 'page_view', path: '/admin' }))
    expect(res.status).toBe(400)
  })

  it('rejects any field outside the allowed list — no free metadata, no name/email/phone/message', async () => {
    mockSupabase()
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ event_type: 'page_view', path: '/', metadata: { anything: true } }))
    expect(res.status).toBe(400)

    const res2 = await POST(fakeRequest({ event_type: 'page_view', path: '/', client_name: 'João' }))
    expect(res2.status).toBe(400)

    const res3 = await POST(fakeRequest({ event_type: 'page_view', path: '/', client_email: 'x@example.com' }))
    expect(res3.status).toBe(400)
  })

  it('nunca confia num professional_id vindo do cliente — o campo nem sequer é aceite', async () => {
    const { insertedRows } = mockSupabase({ professional: { id: 'prof-real' } })
    const { POST } = await import('./route')
    // Tentativa de falsificação: o cliente tenta mandar professional_id diretamente
    const res = await POST(fakeRequest({ event_type: 'page_view', path: '/p/gilson-oliveira', professional_id: 'prof-de-outra-pessoa' }))
    expect(res.status).toBe(400) // campo não permitido
    expect(insertedRows).toHaveLength(0)
  })

  it('resolve professional_id sempre no servidor a partir do slug público', async () => {
    const { insertedRows } = mockSupabase({ professional: { id: 'prof-real' } })
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ event_type: 'page_view', path: '/p/gilson-oliveira', professional_slug: 'gilson-oliveira' }))
    expect(res.status).toBe(200)
    expect(insertedRows[0].professional_id).toBe('prof-real')
  })

  it('slug inexistente resulta em professional_id null, nunca num erro nem numa atribuição arbitrária', async () => {
    const { insertedRows } = mockSupabase({ professional: null })
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ event_type: 'page_view', path: '/p/nao-existe', professional_slug: 'nao-existe' }))
    expect(res.status).toBe(200)
    expect(insertedRows[0].professional_id).toBeNull()
  })

  it('filters known bots/crawlers — including the WhatsApp link-preview fetcher — without recording an event', async () => {
    const { insertedRows } = mockSupabase()
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ event_type: 'page_view', path: '/' }, { 'user-agent': 'WhatsApp/2.23' }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.tracked).toBe(false)
    expect(insertedRows).toHaveLength(0)
  })

  it('rejects when the Origin header does not match an allowed host', async () => {
    mockSupabase()
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ event_type: 'page_view', path: '/' }, { origin: 'https://evil-site.example.com' }))
    expect(res.status).toBe(403)
  })

  it('applies rate limiting per visitor_hash', async () => {
    const insertedRows: Record<string, unknown>[] = []
    const from = vi.fn((table: string) => {
      if (table === 'professionals') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }
      if (table === 'analytics_events') {
        return {
          select: () => ({ eq: () => ({ gte: async () => ({ count: 999 }) }) }), // já muito acima do limite
          insert: (row: Record<string, unknown>) => { insertedRows.push(row); return Promise.resolve({ error: null }) },
        }
      }
      throw new Error(`tabela inesperada: ${table}`)
    })
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ event_type: 'page_view', path: '/' }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.tracked).toBe(false)
    expect(insertedRows).toHaveLength(0)
  })

  it('does nothing (but does not error to the browser) when ANALYTICS_HASH_SECRET is missing', async () => {
    delete process.env.ANALYTICS_HASH_SECRET
    const { insertedRows } = mockSupabase()
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ event_type: 'page_view', path: '/' }))
    expect(res.status).toBe(200)
    expect(insertedRows).toHaveLength(0)
  })

  it('sanitizes UTM values and only stores the referrer domain, never the full URL', async () => {
    const { insertedRows } = mockSupabase()
    const { POST } = await import('./route')
    await POST(fakeRequest({
      event_type: 'page_view',
      path: '/',
      referrer: 'https://www.instagram.com/p/xyz?secret_token=abc123',
      utm_source: 'instagram<script>',
      utm_campaign: 'a'.repeat(300),
    }))
    expect(insertedRows[0].referrer_domain).toBe('instagram.com')
    expect(insertedRows[0].referrer_domain).not.toContain('secret_token')
    expect(insertedRows[0].utm_source).not.toContain('<')
    expect((insertedRows[0].utm_campaign as string).length).toBeLessThanOrEqual(100)
  })

  it('successfully records a valid event and confirms no IP/User-Agent field is ever inserted', async () => {
    const { insertedRows } = mockSupabase()
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ event_type: 'whatsapp_click', path: '/contactos' }))
    expect(res.status).toBe(200)
    const row = insertedRows[0]
    expect(row).not.toHaveProperty('ip')
    expect(row).not.toHaveProperty('user_agent')
    expect(row).not.toHaveProperty('userAgent')
    expect(JSON.stringify(row)).not.toContain('Mozilla/5.0 (real browser)')
  })
})
