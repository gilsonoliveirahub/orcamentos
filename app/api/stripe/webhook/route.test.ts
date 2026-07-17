import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

const ORIGINAL_ENV = { ...process.env }

function fakeRequest(event: unknown): NextRequest {
  return {
    text: async () => JSON.stringify(event),
    headers: { get: () => null }, // sem assinatura — a rota cai para JSON.parse(body) direto
  } as unknown as NextRequest
}

// subscription.items.data[0].current_period_start/end — não no topo da
// Subscription (SDK 21.x / API 2025-03-31+ já só expõe os campos aí).
function mockStripe({ retrieve, update }: { retrieve: ReturnType<typeof vi.fn>; update?: ReturnType<typeof vi.fn> }) {
  vi.doMock('stripe', () => ({
    __esModule: true,
    default: vi.fn().mockImplementation(function StripeMock(this: unknown) {
      Object.assign(this as object, {
        webhooks: { constructEvent: vi.fn() },
        subscriptions: { retrieve, update: update ?? vi.fn() },
      })
    }),
  }))
}

type MockDb = {
  from: ReturnType<typeof vi.fn>
  updatesByTable: Record<string, Record<string, unknown>[]>
}

// Mock genérico, indexado por tabela, para professionals e
// stripe_webhook_events (a guarda de idempotência corre em TODOS os
// testes, por isso tem de estar sempre presente). `professionalSelect`
// escolhe a resposta do único .select(...).eq(...).single()/maybeSingle()
// usado nestes testes.
function mockDb({ professionalSelect, isDuplicateEvent = false }: { professionalSelect?: unknown; isDuplicateEvent?: boolean }): MockDb {
  const updatesByTable: Record<string, Record<string, unknown>[]> = { professionals: [], stripe_webhook_events: [] }
  const from = vi.fn((table: string) => {
    if (table === 'stripe_webhook_events') {
      return {
        insert: (payload: Record<string, unknown>) => {
          updatesByTable.stripe_webhook_events.push(payload)
          return Promise.resolve({ error: isDuplicateEvent ? { message: 'duplicate key' } : null })
        },
      }
    }
    if (table === 'professionals') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: professionalSelect }),
            maybeSingle: async () => ({ data: professionalSelect }),
          }),
        }),
        update: (payload: Record<string, unknown>) => {
          updatesByTable.professionals.push(payload)
          return { eq: () => Promise.resolve({}) }
        },
      }
    }
    throw new Error(`tabela inesperada: ${table}`)
  })
  return { from, updatesByTable }
}

describe('POST /api/stripe/webhook', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env = { ...ORIGINAL_ENV, STRIPE_SECRET_KEY: 'sk_test_fake' }
    delete process.env.STRIPE_WEBHOOK_SECRET // força o caminho sem verificação de assinatura nos testes
  })
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.restoreAllMocks()
    vi.doUnmock('@/lib/supabase-admin')
    vi.doUnmock('@/lib/email')
    vi.doUnmock('stripe')
  })

  describe('período de subscrição (current_period_start/end)', () => {
    it('checkout.session.completed (nova subscrição) grava current_period_start/end a partir do item da subscrição', async () => {
      const retrieve = vi.fn().mockResolvedValue({
        metadata: {},
        items: { data: [{ current_period_start: 1752624000, current_period_end: 1755302400 }] }, // 2025-07-16 → 2025-08-16 (UTC)
      })
      mockStripe({ retrieve })
      const db = mockDb({ professionalSelect: { name: 'Prof', email: 'prof@example.com', marketplace_credits: 0 } })
      vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: db.from } }))
      vi.doMock('@/lib/email', () => ({ emailNovoPagamento: vi.fn().mockResolvedValue(undefined) }))

      const { POST } = await import('./route')
      await POST(fakeRequest({
        id: 'evt_1',
        type: 'checkout.session.completed',
        data: { object: { metadata: { professional_id: 'prof-1', plan: 'starter' }, customer: 'cus_1', subscription: 'sub_1' } },
      }))

      expect(retrieve).toHaveBeenCalledWith('sub_1')
      expect(db.updatesByTable.professionals[0]).toMatchObject({
        plan: 'starter',
        current_period_start: new Date(1752624000 * 1000).toISOString(),
        current_period_end: new Date(1755302400 * 1000).toISOString(),
      })
    })

    it('invoice.payment_succeeded (renovação) atualiza current_period_start/end para o novo ciclo', async () => {
      const retrieve = vi.fn().mockResolvedValue({
        metadata: { plan: 'pro' },
        items: { data: [{ price: { id: 'price_1TPAOELFTn4mze6dDaYx6snk' }, current_period_start: 1755302400, current_period_end: 1757980800 }] },
      })
      mockStripe({ retrieve })
      const db = mockDb({ professionalSelect: { pending_plan: null } })
      vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: db.from } }))
      vi.doMock('@/lib/email', () => ({ emailNovoPagamento: vi.fn() }))

      const { POST } = await import('./route')
      await POST(fakeRequest({
        id: 'evt_2',
        type: 'invoice.payment_succeeded',
        data: { object: { subscription: 'sub_1', billing_reason: 'subscription_cycle' } },
      }))

      expect(db.updatesByTable.professionals).toContainEqual({
        plan: 'pro',
        pending_plan: null,
        current_period_start: new Date(1755302400 * 1000).toISOString(),
        current_period_end: new Date(1757980800 * 1000).toISOString(),
      })
    })
  })

  describe('idempotência — o mesmo evento Stripe entregue duas vezes nunca duplica efeitos', () => {
    it('evento já processado (mesmo event.id): devolve ok sem tocar em nada', async () => {
      const retrieve = vi.fn()
      mockStripe({ retrieve })
      const db = mockDb({ isDuplicateEvent: true })
      vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: db.from } }))
      vi.doMock('@/lib/email', () => ({ emailNovoPagamento: vi.fn() }))

      const { POST } = await import('./route')
      const res = await POST(fakeRequest({
        id: 'evt_repetido',
        type: 'checkout.session.completed',
        data: { object: { metadata: { professional_id: 'prof-1', type: 'credits', credits: '5' } } },
      }))
      const json = await res.json()

      expect(json).toEqual({ ok: true, duplicate: true })
      expect(db.updatesByTable.professionals).toHaveLength(0) // não creditou de novo
      expect(retrieve).not.toHaveBeenCalled()
    })
  })

  describe('upgrade Starter→Pro (mesma subscrição) e downgrade agendado via Subscription Schedule', () => {
    // A troca de preço de um downgrade acontece no Stripe (Subscription
    // Schedule criada em /api/stripe/checkout), ANTES desta fatura de
    // renovação ser gerada — nunca aqui. Por isso este handler nunca chama
    // subscriptions.update: só lê o que o Stripe já decidiu (o item já
    // reflete o preço Starter, 19€, porque a fase 2 da agenda já entrou em
    // vigor) e sincroniza plan + limpa pending_plan.
    it('renovação após um downgrade agendado: o item já vem com o preço Starter (a fatura já foi cobrada a 19€) — só sincroniza, nunca chama subscriptions.update', async () => {
      const retrieve = vi.fn().mockResolvedValue({
        metadata: {},
        items: { data: [{ id: 'si_1', price: { id: 'price_1TPAO4LFTn4mze6d70qkDWAj' }, current_period_start: 1755302400, current_period_end: 1758672000 }] },
      })
      const update = vi.fn() // subscriptions.update — NUNCA deve ser chamado aqui
      mockStripe({ retrieve, update })
      const db = mockDb({ professionalSelect: { pending_plan: 'starter' } })
      vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: db.from } }))
      vi.doMock('@/lib/email', () => ({ emailNovoPagamento: vi.fn() }))

      const { POST } = await import('./route')
      await POST(fakeRequest({
        id: 'evt_renovacao_apos_downgrade',
        type: 'invoice.payment_succeeded',
        data: { object: { subscription: 'sub_1', billing_reason: 'subscription_cycle' } },
      }))

      expect(update).not.toHaveBeenCalled()
      expect(db.updatesByTable.professionals).toContainEqual(expect.objectContaining({ plan: 'starter', pending_plan: null }))
    })

    it('invoice.payment_succeeded sem pending_plan: não chama subscriptions.update, só sincroniza o plano atual', async () => {
      const retrieve = vi.fn().mockResolvedValue({
        metadata: {},
        items: { data: [{ id: 'si_1', price: { id: 'price_1TPAOELFTn4mze6dDaYx6snk' }, current_period_start: 1755302400, current_period_end: 1757980800 }] },
      })
      const update = vi.fn()
      mockStripe({ retrieve, update })
      const db = mockDb({ professionalSelect: { pending_plan: null } })
      vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: db.from } }))
      vi.doMock('@/lib/email', () => ({ emailNovoPagamento: vi.fn() }))

      const { POST } = await import('./route')
      await POST(fakeRequest({
        id: 'evt_renovacao_normal',
        type: 'invoice.payment_succeeded',
        data: { object: { subscription: 'sub_1', billing_reason: 'subscription_cycle' } },
      }))

      expect(update).not.toHaveBeenCalled()
      expect(db.updatesByTable.professionals).toContainEqual(expect.objectContaining({ plan: 'pro', pending_plan: null }))
    })

    it('invoice.payment_failed de uma proration de upgrade (subscription_update): NUNCA desativa o plano', async () => {
      const retrieve = vi.fn()
      mockStripe({ retrieve })
      const db = mockDb({})
      vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: db.from } }))
      vi.doMock('@/lib/email', () => ({ emailNovoPagamento: vi.fn() }))

      const { POST } = await import('./route')
      await POST(fakeRequest({
        id: 'evt_falha_upgrade',
        type: 'invoice.payment_failed',
        data: { object: { subscription: 'sub_1', billing_reason: 'subscription_update' } },
      }))

      expect(db.updatesByTable.professionals).toHaveLength(0)
    })

    it('invoice.payment_failed de uma renovação normal (subscription_cycle): desativa o plano como antes', async () => {
      const retrieve = vi.fn()
      mockStripe({ retrieve })
      const db = mockDb({})
      vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: db.from } }))
      vi.doMock('@/lib/email', () => ({ emailNovoPagamento: vi.fn() }))

      const { POST } = await import('./route')
      await POST(fakeRequest({
        id: 'evt_falha_renovacao',
        type: 'invoice.payment_failed',
        data: { object: { subscription: 'sub_1', billing_reason: 'subscription_cycle' } },
      }))

      expect(db.updatesByTable.professionals).toContainEqual({ plan: 'inactive' })
    })

    it('customer.subscription.updated sincroniza plano e período (rede de segurança para o Portal Stripe)', async () => {
      const retrieve = vi.fn()
      mockStripe({ retrieve })
      const db = mockDb({})
      vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: db.from } }))
      vi.doMock('@/lib/email', () => ({ emailNovoPagamento: vi.fn() }))

      const { POST } = await import('./route')
      await POST(fakeRequest({
        id: 'evt_sub_updated',
        type: 'customer.subscription.updated',
        data: { object: { id: 'sub_1', metadata: { plan: 'pro' }, items: { data: [{ price: { id: 'price_1TPAOELFTn4mze6dDaYx6snk' }, current_period_start: 1755302400, current_period_end: 1757980800 }] } } },
      }))

      expect(db.updatesByTable.professionals).toContainEqual({
        plan: 'pro',
        current_period_start: new Date(1755302400 * 1000).toISOString(),
        current_period_end: new Date(1757980800 * 1000).toISOString(),
      })
    })
  })
})
