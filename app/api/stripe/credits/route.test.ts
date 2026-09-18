import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

function fakeRequest(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest
}

function mockStripe(sessionsCreate: ReturnType<typeof vi.fn>) {
  vi.doMock('stripe', () => ({
    __esModule: true,
    default: vi.fn().mockImplementation(function StripeMock(this: unknown) {
      Object.assign(this as object, { checkout: { sessions: { create: sessionsCreate } } })
    }),
  }))
}

function mockProfessional(prof: unknown) {
  vi.doMock('@/lib/supabase-admin', () => ({
    supabaseAdmin: {
      from: (table: string) => {
        if (table !== 'professionals') throw new Error(`tabela inesperada: ${table}`)
        return { select: () => ({ eq: () => ({ single: async () => ({ data: prof }) }) }) }
      },
    },
  }))
}

describe('POST /api/stripe/credits — P2 (2026-09-18): novos pacotes, todos com IVA incluído', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => { vi.restoreAllMocks(); vi.doUnmock('stripe'); vi.doUnmock('@/lib/supabase-admin') })

  it('recusa um pack inexistente (ex: os antigos "pack20" nunca existiram, e um id inválido novo também não passa)', async () => {
    mockProfessional({ id: 'prof-1', email: 'p@example.com' })
    mockStripe(vi.fn())
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ professional_id: 'prof-1', pack: 'pack-inexistente' }))
    expect(res.status).toBe(400)
  })

  it('recusa quando o profissional não existe', async () => {
    mockProfessional(null)
    mockStripe(vi.fn())
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ professional_id: 'prof-x', pack: 'pack1' }))
    expect(res.status).toBe(404)
  })

  const cases: Array<{ pack: string; credits: number; cents: number }> = [
    { pack: 'pack1', credits: 1, cents: 990 },
    { pack: 'pack10', credits: 10, cents: 8910 },
    { pack: 'pack25', credits: 25, cents: 21038 },
    { pack: 'pack50', credits: 50, cents: 37125 },
  ]

  for (const { pack, credits, cents } of cases) {
    it(`pack "${pack}": cria sessão Stripe com unit_amount=${cents} cêntimos e metadata.credits="${credits}" (verdade do servidor, nunca do browser)`, async () => {
      mockProfessional({ id: 'prof-1', email: 'p@example.com' })
      const sessionsCreate = vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/session123' })
      mockStripe(sessionsCreate)

      const { POST } = await import('./route')
      const res = await POST(fakeRequest({ professional_id: 'prof-1', pack }))
      const json = await res.json()

      expect(json.url).toBe('https://checkout.stripe.com/session123')
      const call = sessionsCreate.mock.calls[0][0]
      expect(call.metadata).toMatchObject({ professional_id: 'prof-1', credits: String(credits), type: 'credits' })
      expect(call.line_items[0].price_data.unit_amount).toBe(cents)
      expect(call.line_items[0].price_data.currency).toBe('eur')
      expect(call.mode).toBe('payment')
    })
  }

  it('o valor creditado depende só da metadata definida aqui no servidor (pack->credits), nunca de um campo enviado pelo browser', async () => {
    // O corpo do pedido só manda o ID do pacote — o número de créditos e o
    // valor cobrado vêm sempre de lib/marketplace-credits.ts no servidor,
    // nunca de um "credits" ou "amount" que o cliente pudesse enviar.
    mockProfessional({ id: 'prof-1', email: 'p@example.com' })
    const sessionsCreate = vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/x' })
    mockStripe(sessionsCreate)

    const { POST } = await import('./route')
    await POST(fakeRequest({ professional_id: 'prof-1', pack: 'pack10', credits: 999999, amount: 1 }))

    const call = sessionsCreate.mock.calls[0][0]
    expect(call.metadata.credits).toBe('10') // nunca "999999"
    expect(call.line_items[0].price_data.unit_amount).toBe(8910) // nunca 1
  })
})
