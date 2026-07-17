import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

const ORIGINAL_ENV = { ...process.env }

function fakeRequest(body: unknown): NextRequest {
  return {
    json: async () => body,
    headers: { get: (name: string) => (name === 'user-agent' ? 'Mozilla/5.0 (cliente real)' : name === 'x-forwarded-for' ? '203.0.113.9' : null) },
  } as unknown as NextRequest
}

function mockSupabase() {
  const leadInserts: Record<string, unknown>[] = []
  const analyticsInserts: Record<string, unknown>[] = []
  const consentUpserts: Array<[Record<string, unknown>, Record<string, unknown>]> = []
  const from = vi.fn((table: string) => {
    if (table === 'leads') {
      return {
        insert: (payload: Record<string, unknown>) => {
          leadInserts.push(payload)
          return { select: () => ({ single: async () => ({ data: { id: 'lead-1', ...payload }, error: null }) }) }
        },
      }
    }
    if (table === 'marketing_consents') {
      return { upsert: (payload: Record<string, unknown>, opts: Record<string, unknown>) => { consentUpserts.push([payload, opts]); return Promise.resolve({ error: null }) } }
    }
    if (table === 'analytics_events') {
      return { insert: (row: Record<string, unknown>) => { analyticsInserts.push(row); return Promise.resolve({ error: null }) } }
    }
    throw new Error(`tabela inesperada: ${table} — a rota já não deve consultar 'professionals' (atribuição automática removida)`)
  })
  vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))
  return { leadInserts, analyticsInserts, consentUpserts }
}

describe('POST /api/leads/marketplace — sem atribuição automática (removida 2026-07-16)', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env = { ...ORIGINAL_ENV, ANALYTICS_HASH_SECRET: 'segredo-teste' }
  })
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.restoreAllMocks()
    vi.doUnmock('@/lib/supabase-admin')
  })

  it('cria sempre o lead com professional_id null, locked true, status pendente — nunca consulta a tabela professionals', async () => {
    const { leadInserts } = mockSupabase()
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ specialty: 'Pintura', zone_requested: 'Lisboa', name: 'Cliente', phone: '351911111111' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.assigned).toBe(false)
    expect(leadInserts[0]).toMatchObject({ professional_id: null, locked: true, status: 'pendente', source: 'marketplace' })
  })

  it('geocodifica a zona pedida e grava lat/lng quando reconhecida', async () => {
    const { leadInserts } = mockSupabase()
    const { POST } = await import('./route')
    await POST(fakeRequest({ specialty: 'Pintura', zone_requested: 'Lisboa', name: 'Cliente', phone: '351911111111' }))

    expect(leadInserts[0].lat).toBeCloseTo(38.7223, 2)
    expect(leadInserts[0].lng).toBeCloseTo(-9.1393, 2)
  })

  it('zona não reconhecida: grava lat/lng null, sem falhar a criação do lead', async () => {
    const { leadInserts } = mockSupabase()
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ specialty: 'Pintura', zone_requested: 'Nárnia', name: 'Cliente', phone: '351911111111' }))

    expect(res.status).toBe(200)
    expect(leadInserts[0].lat).toBeNull()
    expect(leadInserts[0].lng).toBeNull()
  })

  it('regista request_completed sempre com professional_id null (conta na plataforma, não em nenhum profissional)', async () => {
    const { analyticsInserts } = mockSupabase()
    const { POST } = await import('./route')
    await POST(fakeRequest({ specialty: 'Canalização', zone_requested: null, name: 'Cliente', phone: '351922222222' }))

    expect(analyticsInserts).toHaveLength(1)
    expect(analyticsInserts[0]).toMatchObject({ event_type: 'request_completed', professional_id: null, source: 'marketplace' })
  })

  it('não regista request_completed quando a criação do lead falha', async () => {
    const analyticsInsert = vi.fn()
    const from = vi.fn((table: string) => {
      if (table === 'leads') return { insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: 'falha' } }) }) }) }
      if (table === 'analytics_events') return { insert: analyticsInsert }
      throw new Error(`tabela inesperada: ${table}`)
    })
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ specialty: 'Pintura', zone_requested: 'Lisboa', name: 'Cliente', phone: '351911111111' }))

    expect(res.status).toBe(400)
    expect(analyticsInsert).not.toHaveBeenCalled()
  })
})

describe('POST /api/leads/marketplace — consentimento de marketing do CLIENTE', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env = { ...ORIGINAL_ENV, ANALYTICS_HASH_SECRET: 'segredo-teste' }
  })
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.restoreAllMocks()
    vi.doUnmock('@/lib/supabase-admin')
  })

  it('checkbox marcada + email: grava no lead e regista em marketing_consents com origem pedir', async () => {
    const { leadInserts, consentUpserts } = mockSupabase()
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({
      specialty: 'Pintura', zone_requested: 'Lisboa', name: 'Cliente', phone: '351911111111',
      email: 'cliente@example.com', marketing_opt_in: true,
    }))

    expect(res.status).toBe(200)
    expect(leadInserts[0]).toMatchObject({ marketing_opt_in: true, marketing_consent_version: 'v1', marketing_consent_source: 'pedir' })
    expect(consentUpserts).toHaveLength(1)
    expect(consentUpserts[0][0]).toMatchObject({ email: 'cliente@example.com', opted_in: true })
  })

  it('checkbox desmarcada: grava false no lead e não toca em marketing_consents', async () => {
    const { leadInserts, consentUpserts } = mockSupabase()
    const { POST } = await import('./route')
    await POST(fakeRequest({
      specialty: 'Pintura', zone_requested: 'Lisboa', name: 'Cliente', phone: '351911111111', email: 'cliente@example.com',
    }))

    expect(leadInserts[0]).toMatchObject({ marketing_opt_in: false, marketing_consent_version: null, marketing_consent_source: null })
    expect(consentUpserts).toHaveLength(0)
  })
})
