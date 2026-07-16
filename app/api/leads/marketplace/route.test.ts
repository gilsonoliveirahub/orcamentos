import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

const ORIGINAL_ENV = { ...process.env }

function fakeRequest(body: unknown): NextRequest {
  return {
    json: async () => body,
    headers: { get: (name: string) => (name === 'user-agent' ? 'Mozilla/5.0 (cliente real)' : name === 'x-forwarded-for' ? '203.0.113.9' : null) },
  } as unknown as NextRequest
}

// Encadeamento genérico: eq/ilike/in/order/limit devolvem sempre o mesmo
// objeto (independentemente da ordem/combinação chamada pela rota), e
// maybeSingle resolve para o resultado fixo — cobre tanto a pesquisa com zona
// (eq.eq.ilike.in.order.limit) como a pesquisa de recurso sem zona (eq.eq.in.order.limit).
function professionalQuery(result: { id: string; marketplace_credits: number } | null) {
  const obj: Record<string, unknown> = {
    eq: () => obj,
    ilike: () => obj,
    in: () => obj,
    order: () => obj,
    limit: () => obj,
    maybeSingle: async () => ({ data: result }),
  }
  return obj
}

describe('POST /api/leads/marketplace — registo de request_completed', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env = { ...ORIGINAL_ENV, ANALYTICS_HASH_SECRET: 'segredo-teste' }
    // A rota dispara uma notificação fetch() fire-and-forget quando atribui um
    // profissional — nunca deve fazer um pedido de rede real durante os testes.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.doUnmock('@/lib/supabase-admin')
  })

  it('regista request_completed com o profissional atribuído quando existe correspondência', async () => {
    const analyticsInserts: Record<string, unknown>[] = []
    const from = vi.fn((table: string) => {
      if (table === 'professionals') return { select: () => professionalQuery({ id: 'prof-1', marketplace_credits: 0 }) }
      if (table === 'leads') return { insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'lead-1' }, error: null }) }) }) }
      if (table === 'analytics_events') return { insert: (row: Record<string, unknown>) => { analyticsInserts.push(row); return Promise.resolve({ error: null }) } }
      throw new Error(`tabela inesperada: ${table}`)
    })
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ specialty: 'Pintura', zone_requested: 'Lisboa', name: 'Cliente', phone: '351911111111' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.assigned).toBe(true)
    expect(analyticsInserts).toHaveLength(1)
    expect(analyticsInserts[0]).toMatchObject({ event_type: 'request_completed', professional_id: 'prof-1', source: 'marketplace' })
  })

  it('sem profissional disponível: request_completed é registado com professional_id null — conta na plataforma, não em nenhum profissional', async () => {
    const analyticsInserts: Record<string, unknown>[] = []
    const from = vi.fn((table: string) => {
      if (table === 'professionals') return { select: () => professionalQuery(null) }
      if (table === 'leads') return { insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'lead-2' }, error: null }) }) }) }
      if (table === 'analytics_events') return { insert: (row: Record<string, unknown>) => { analyticsInserts.push(row); return Promise.resolve({ error: null }) } }
      throw new Error(`tabela inesperada: ${table}`)
    })
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ specialty: 'Canalização', zone_requested: null, name: 'Cliente', phone: '351922222222' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.assigned).toBe(false)
    expect(analyticsInserts).toHaveLength(1)
    expect(analyticsInserts[0]).toMatchObject({ event_type: 'request_completed', professional_id: null, source: 'marketplace' })
  })

  it('nunca faz um pedido de rede real — a notificação de novo lead é sempre interceptada pelo mock de fetch', async () => {
    const from = vi.fn((table: string) => {
      if (table === 'professionals') return { select: () => professionalQuery({ id: 'prof-1', marketplace_credits: 0 }) }
      if (table === 'leads') return { insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'lead-3' }, error: null }) }) }) }
      if (table === 'analytics_events') return { insert: async () => ({ error: null }) }
      throw new Error(`tabela inesperada: ${table}`)
    })
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))

    const { POST } = await import('./route')
    await POST(fakeRequest({ specialty: 'Pintura', zone_requested: 'Porto', name: 'Cliente', phone: '351933333333' }))

    expect(fetch).toHaveBeenCalledTimes(1)
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain('/api/notifications/lead')
  })
})
