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

// Mock genérico, indexado por tabela. Dois modos de leitura de
// `professionals`, porque o próprio código da rota usa os dois:
//  - `professionalSelect`: usado por checkout.session.completed, que
//    identifica sempre pelo id (metadata.professional_id) e usa `.single()`.
//  - `professionalsByCustomer`: usado por invoice.payment_succeeded e
//    customer.subscription.updated (findProfessionalByCustomer, 2026-09-19,
//    proteção contra dupla subscrição) — identifica pelo stripe_customer_id
//    SEM `.single()`/`.maybeSingle()`, porque o código precisa de saber se
//    encontrou 0, 1 ou 2+ linhas (nunca escolher ambiguamente). Por
//    omissão, se só `professionalSelect` for dado, é devolvido como lista
//    de 1 item — mantém os testes antigos simples de escrever.
function mockDb({
  professionalSelect, professionalsByCustomer, isDuplicateEvent = false,
}: {
  professionalSelect?: unknown
  professionalsByCustomer?: unknown[]
  isDuplicateEvent?: boolean
}): MockDb {
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
          eq: () => {
            const rows = professionalsByCustomer ?? (professionalSelect ? [professionalSelect] : [])
            const arrayPromise = Promise.resolve({ data: rows, error: null })
            return Object.assign(arrayPromise, {
              single: async () => ({ data: professionalSelect }),
              maybeSingle: async () => ({ data: professionalSelect }),
            })
          },
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

const STARTER_MONTHLY = 'price_1TPAO4LFTn4mze6d70qkDWAj'
const PRO_MONTHLY = 'price_1TPAOELFTn4mze6dDaYx6snk'
const STARTER_ANNUAL = 'price_1UHAsXLFTn4mze6dU5uk5YkJ'
const PRO_ANNUAL = 'price_1UHAuTLFTn4mze6d29nsPNiC'

// Registo de conflitos (lib/subscription-conflicts.ts) e libertação da
// reserva de checkout (lib/checkout-lock.ts) — mockados diretamente, os
// mesmos módulos já testados em separado (lib/checkout-lock.test.ts).
// releaseCheckoutLock agora exige (professional_id, idempotency_key) em
// conjunto (2026-09-19, requisito 2 da revisão adversarial).
function mockConflicts() {
  const flag = vi.fn().mockResolvedValue(undefined)
  vi.doMock('@/lib/subscription-conflicts', () => ({ flagSubscriptionConflict: flag }))
  return flag
}

function mockCheckoutLockRelease() {
  const release = vi.fn().mockResolvedValue(undefined)
  vi.doMock('@/lib/checkout-lock', () => ({ releaseCheckoutLock: release }))
  return release
}

describe('POST /api/stripe/webhook', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env = {
      ...ORIGINAL_ENV, STRIPE_SECRET_KEY: 'sk_test_fake',
      STRIPE_PRICE_STARTER_ANNUAL: STARTER_ANNUAL, STRIPE_PRICE_PRO_ANNUAL: PRO_ANNUAL,
    }
    delete process.env.STRIPE_WEBHOOK_SECRET // força o caminho sem verificação de assinatura nos testes
    mockConflicts()
    mockCheckoutLockRelease()
  })
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.restoreAllMocks()
    vi.doUnmock('@/lib/supabase-admin')
    vi.doUnmock('@/lib/email')
    vi.doUnmock('@/lib/subscription-conflicts')
    vi.doUnmock('@/lib/checkout-lock')
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
        customer: 'cus_1',
        items: { data: [{ price: { id: 'price_1TPAOELFTn4mze6dDaYx6snk' }, current_period_start: 1755302400, current_period_end: 1757980800 }] },
      })
      mockStripe({ retrieve })
      const db = mockDb({ professionalsByCustomer: [{ id: 'prof-1', stripe_subscription_id: null }] })
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
    it('renovação após um downgrade agendado: o item já vem com o preço Starter (a fatura já foi cobrada a 19€) — só sincroniza, nunca chama subscriptions.update', async () => {
      const retrieve = vi.fn().mockResolvedValue({
        metadata: {},
        customer: 'cus_1',
        items: { data: [{ id: 'si_1', price: { id: 'price_1TPAO4LFTn4mze6d70qkDWAj' }, current_period_start: 1755302400, current_period_end: 1758672000 }] },
      })
      const update = vi.fn() // subscriptions.update — NUNCA deve ser chamado aqui
      mockStripe({ retrieve, update })
      const db = mockDb({ professionalsByCustomer: [{ id: 'prof-1', stripe_subscription_id: 'sub_1', pending_plan: 'starter' }] })
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
        customer: 'cus_1',
        items: { data: [{ id: 'si_1', price: { id: 'price_1TPAOELFTn4mze6dDaYx6snk' }, current_period_start: 1755302400, current_period_end: 1757980800 }] },
      })
      const update = vi.fn()
      mockStripe({ retrieve, update })
      const db = mockDb({ professionalsByCustomer: [{ id: 'prof-1', stripe_subscription_id: 'sub_1' }] })
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
      // Identificado pelo stripe_customer_id (2026-09-19, proteção contra
      // dupla subscrição) — precisa de existir uma linha com esse `id`,
      // nunca é encontrado só pelo ID de subscrição.
      const db = mockDb({ professionalsByCustomer: [{ id: 'prof-1', stripe_subscription_id: null }] })
      vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: db.from } }))
      vi.doMock('@/lib/email', () => ({ emailNovoPagamento: vi.fn() }))

      const { POST } = await import('./route')
      await POST(fakeRequest({
        id: 'evt_sub_updated',
        type: 'customer.subscription.updated',
        data: { object: { id: 'sub_1', customer: 'cus_1', metadata: { plan: 'pro' }, items: { data: [{ price: { id: 'price_1TPAOELFTn4mze6dDaYx6snk' }, current_period_start: 1755302400, current_period_end: 1757980800 }] } } },
      }))

      expect(db.updatesByTable.professionals).toContainEqual({
        plan: 'pro',
        current_period_start: new Date(1755302400 * 1000).toISOString(),
        current_period_end: new Date(1757980800 * 1000).toISOString(),
      })
    })

    it('customer.subscription.deleted: limpa stripe_subscription_id mas NUNCA stripe_customer_id (reassinatura futura reutiliza o mesmo Customer)', async () => {
      const retrieve = vi.fn()
      mockStripe({ retrieve })
      const db = mockDb({})
      vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: db.from } }))
      vi.doMock('@/lib/email', () => ({ emailNovoPagamento: vi.fn() }))

      const { POST } = await import('./route')
      await POST(fakeRequest({
        id: 'evt_sub_deleted',
        type: 'customer.subscription.deleted',
        data: { object: { id: 'sub_1' } },
      }))

      expect(db.updatesByTable.professionals).toContainEqual({ plan: 'inactive', stripe_subscription_id: null })
      // Nunca deve tocar em stripe_customer_id — nem sequer aparece no payload do update.
      expect(db.updatesByTable.professionals[0]).not.toHaveProperty('stripe_customer_id')
    })
  })

  // P5 (2026-09-19): planos anuais — classifica pelos 4 preços reais
  // (classifyPriceId), nunca confunde Starter com Pro nem mensal com anual.
  describe('mapeamento dos 4 preços (mensal + anual) no webhook', () => {
    const cases: Array<{ label: string; priceId: string; expectedPlan: string }> = [
      { label: 'Starter mensal', priceId: STARTER_MONTHLY, expectedPlan: 'starter' },
      { label: 'Pro mensal', priceId: PRO_MONTHLY, expectedPlan: 'pro' },
      { label: 'Starter anual', priceId: STARTER_ANNUAL, expectedPlan: 'starter' },
      { label: 'Pro anual', priceId: PRO_ANNUAL, expectedPlan: 'pro' },
    ]

    for (const { label, priceId, expectedPlan } of cases) {
      it(`invoice.payment_succeeded classifica ${label} corretamente, mesmo com metadata.plan em falta`, async () => {
        const retrieve = vi.fn().mockResolvedValue({
          metadata: {}, // sem plan no metadata — tem de classificar só pelo Price ID
          customer: 'cus_1',
          items: { data: [{ price: { id: priceId }, current_period_start: 1755302400, current_period_end: 1757980800 }] },
        })
        mockStripe({ retrieve })
        const db = mockDb({ professionalsByCustomer: [{ id: 'prof-1', stripe_subscription_id: null }] })
        vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: db.from } }))
        vi.doMock('@/lib/email', () => ({ emailNovoPagamento: vi.fn() }))

        const { POST } = await import('./route')
        await POST(fakeRequest({
          id: `evt_${label}`,
          type: 'invoice.payment_succeeded',
          data: { object: { subscription: 'sub_1', billing_reason: 'subscription_cycle' } },
        }))

        expect(db.updatesByTable.professionals).toContainEqual(expect.objectContaining({ plan: expectedPlan }))
      })

      it(`customer.subscription.updated classifica ${label} corretamente, mesmo com metadata.plan em falta`, async () => {
        const retrieve = vi.fn()
        mockStripe({ retrieve })
        const db = mockDb({ professionalsByCustomer: [{ id: 'prof-1', stripe_subscription_id: null }] })
        vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: db.from } }))
        vi.doMock('@/lib/email', () => ({ emailNovoPagamento: vi.fn() }))

        const { POST } = await import('./route')
        await POST(fakeRequest({
          id: `evt_sub_updated_${label}`,
          type: 'customer.subscription.updated',
          data: { object: { id: 'sub_1', customer: 'cus_1', metadata: {}, items: { data: [{ price: { id: priceId }, current_period_start: 1755302400, current_period_end: 1757980800 }] } } },
        }))

        expect(db.updatesByTable.professionals).toContainEqual(expect.objectContaining({ plan: expectedPlan }))
      })

      it(`checkout.session.completed (nova subscrição) classifica ${label} pelo Price ID real da subscrição, não pelo metadata da sessão`, async () => {
        const retrieve = vi.fn().mockResolvedValue({
          metadata: {},
          items: { data: [{ price: { id: priceId }, current_period_start: 1755302400, current_period_end: 1757980800 }] },
        })
        mockStripe({ retrieve })
        const db = mockDb({ professionalSelect: { name: 'Prof', email: 'prof@example.com', marketplace_credits: 0 } })
        vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: db.from } }))
        vi.doMock('@/lib/email', () => ({ emailNovoPagamento: vi.fn().mockResolvedValue(undefined) }))

        const { POST } = await import('./route')
        await POST(fakeRequest({
          id: `evt_checkout_${label}`,
          type: 'checkout.session.completed',
          // metadata.plan deliberadamente ERRADO — a classificação pelo
          // Price ID real tem de ganhar sempre, provando que nunca há
          // confusão Starter/Pro por confiar só no metadata.
          data: { object: { metadata: { professional_id: 'prof-1', plan: expectedPlan === 'pro' ? 'starter' : 'pro' }, customer: 'cus_1', subscription: 'sub_1' } },
        }))

        expect(db.updatesByTable.professionals[0]).toMatchObject({ plan: expectedPlan })
      })
    }

    it('nunca classifica um Price ID anual como Starter quando é Pro, nem vice-versa (ausência de classificação incorreta)', async () => {
      const retrieve = vi.fn().mockResolvedValue({
        metadata: {},
        customer: 'cus_1',
        items: { data: [{ price: { id: PRO_ANNUAL }, current_period_start: 1755302400, current_period_end: 1787980800 }] },
      })
      mockStripe({ retrieve })
      const db = mockDb({ professionalsByCustomer: [{ id: 'prof-1', stripe_subscription_id: null }] })
      vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: db.from } }))
      vi.doMock('@/lib/email', () => ({ emailNovoPagamento: vi.fn() }))

      const { POST } = await import('./route')
      await POST(fakeRequest({
        id: 'evt_pro_annual_never_starter',
        type: 'invoice.payment_succeeded',
        data: { object: { subscription: 'sub_1', billing_reason: 'subscription_cycle' } },
      }))

      const update = db.updatesByTable.professionals[0]
      expect(update.plan).toBe('pro')
      expect(update.plan).not.toBe('starter')
    })
  })

  // Proteção contra dupla subscrição (2026-09-19): webhooks podem chegar
  // fora de ordem — nunca sobrescreve nem cancela silenciosamente quando
  // surge um ID de subscrição diferente do já registado, só regista o
  // conflito para intervenção administrativa.
  describe('conflitos de subscrição (IDs diferentes, possível dupla subscrição)', () => {
    it('checkout.session.completed: a BD já tem uma subscrição DIFERENTE registada → nunca sobrescreve, regista conflito e liberta a reserva de checkout (pelo idempotency_key da metadata)', async () => {
      const retrieve = vi.fn().mockResolvedValue({
        metadata: {},
        items: { data: [{ price: { id: STARTER_MONTHLY }, current_period_start: 1755302400, current_period_end: 1757980800 }] },
      })
      mockStripe({ retrieve })
      const db = mockDb({ professionalSelect: { name: 'Prof', email: 'prof@example.com', marketplace_credits: 0, stripe_subscription_id: 'sub_ja_existente' } })
      vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: db.from } }))
      vi.doMock('@/lib/email', () => ({ emailNovoPagamento: vi.fn() }))
      const flag = mockConflicts()
      const release = mockCheckoutLockRelease()

      const { POST } = await import('./route')
      await POST(fakeRequest({
        id: 'evt_conflito_checkout',
        type: 'checkout.session.completed',
        data: { object: { metadata: { professional_id: 'prof-1', plan: 'starter', checkout_idempotency_key: 'idem-abc' }, customer: 'cus_1', subscription: 'sub_nova_diferente' } },
      }))

      expect(db.updatesByTable.professionals).toHaveLength(0) // nunca escreve por cima
      expect(flag).toHaveBeenCalledWith(expect.objectContaining({
        professionalId: 'prof-1', existingSubscriptionId: 'sub_ja_existente', newSubscriptionId: 'sub_nova_diferente',
        source: 'checkout.session.completed', eventId: 'evt_conflito_checkout',
      }))
      expect(release).toHaveBeenCalledWith('prof-1', 'idem-abc')
    })

    it('checkout.session.completed com sucesso normal (sem conflito): liberta sempre a reserva de checkout no fim, pelo idempotency_key da metadata', async () => {
      const retrieve = vi.fn().mockResolvedValue({
        metadata: {},
        items: { data: [{ price: { id: STARTER_MONTHLY }, current_period_start: 1755302400, current_period_end: 1757980800 }] },
      })
      mockStripe({ retrieve })
      const db = mockDb({ professionalSelect: { name: 'Prof', email: 'prof@example.com', marketplace_credits: 0, stripe_subscription_id: null } })
      vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: db.from } }))
      vi.doMock('@/lib/email', () => ({ emailNovoPagamento: vi.fn().mockResolvedValue(undefined) }))
      const release = mockCheckoutLockRelease()

      const { POST } = await import('./route')
      await POST(fakeRequest({
        id: 'evt_sucesso_normal',
        type: 'checkout.session.completed',
        data: { object: { metadata: { professional_id: 'prof-1', plan: 'starter', checkout_idempotency_key: 'idem-xyz' }, customer: 'cus_1', subscription: 'sub_1' } },
      }))

      expect(db.updatesByTable.professionals).toHaveLength(1)
      expect(release).toHaveBeenCalledWith('prof-1', 'idem-xyz')
    })

    it('checkout.session.completed sem checkout_idempotency_key na metadata (sessão antiga, criada antes desta proteção): não liberta nada, nunca rebenta', async () => {
      const retrieve = vi.fn().mockResolvedValue({
        metadata: {},
        items: { data: [{ price: { id: STARTER_MONTHLY }, current_period_start: 1755302400, current_period_end: 1757980800 }] },
      })
      mockStripe({ retrieve })
      const db = mockDb({ professionalSelect: { name: 'Prof', email: 'prof@example.com', marketplace_credits: 0, stripe_subscription_id: null } })
      vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: db.from } }))
      vi.doMock('@/lib/email', () => ({ emailNovoPagamento: vi.fn().mockResolvedValue(undefined) }))
      const release = mockCheckoutLockRelease()

      const { POST } = await import('./route')
      await POST(fakeRequest({
        id: 'evt_sem_key',
        type: 'checkout.session.completed',
        data: { object: { metadata: { professional_id: 'prof-1', plan: 'starter' }, customer: 'cus_1', subscription: 'sub_1' } },
      }))

      expect(release).not.toHaveBeenCalled()
      expect(db.updatesByTable.professionals).toHaveLength(1)
    })

    it('checkout.session.expired: liberta a reserva de checkout pelo idempotency_key da metadata, nunca toca em professionals', async () => {
      const retrieve = vi.fn()
      mockStripe({ retrieve })
      const db = mockDb({})
      vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: db.from } }))
      vi.doMock('@/lib/email', () => ({ emailNovoPagamento: vi.fn() }))
      const release = mockCheckoutLockRelease()

      const { POST } = await import('./route')
      await POST(fakeRequest({
        id: 'evt_sessao_expirada',
        type: 'checkout.session.expired',
        data: { object: { metadata: { professional_id: 'prof-1', checkout_idempotency_key: 'idem-expirada' } } },
      }))

      expect(release).toHaveBeenCalledWith('prof-1', 'idem-expirada')
      expect(db.updatesByTable.professionals).toHaveLength(0)
    })

    it('invoice.payment_succeeded fora de ordem: a BD já tem uma subscrição DIFERENTE registada → nunca sobrescreve, só regista o conflito', async () => {
      const retrieve = vi.fn().mockResolvedValue({
        metadata: {},
        customer: 'cus_1',
        items: { data: [{ price: { id: PRO_MONTHLY }, current_period_start: 1755302400, current_period_end: 1757980800 }] },
      })
      mockStripe({ retrieve })
      const db = mockDb({ professionalsByCustomer: [{ id: 'prof-1', stripe_subscription_id: 'sub_antiga_diferente' }] })
      vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: db.from } }))
      vi.doMock('@/lib/email', () => ({ emailNovoPagamento: vi.fn() }))
      const flag = mockConflicts()

      const { POST } = await import('./route')
      await POST(fakeRequest({
        id: 'evt_invoice_fora_de_ordem',
        type: 'invoice.payment_succeeded',
        data: { object: { subscription: 'sub_recebida_agora', billing_reason: 'subscription_cycle' } },
      }))

      expect(db.updatesByTable.professionals).toHaveLength(0)
      expect(flag).toHaveBeenCalledWith(expect.objectContaining({
        professionalId: 'prof-1', existingSubscriptionId: 'sub_antiga_diferente', newSubscriptionId: 'sub_recebida_agora',
        source: 'invoice.payment_succeeded', eventId: 'evt_invoice_fora_de_ordem',
      }))
    })

    it('customer.subscription.updated fora de ordem: a BD já tem uma subscrição DIFERENTE registada → nunca sobrescreve, só regista o conflito', async () => {
      const retrieve = vi.fn()
      mockStripe({ retrieve })
      const db = mockDb({ professionalsByCustomer: [{ id: 'prof-1', stripe_subscription_id: 'sub_antiga_diferente' }] })
      vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: db.from } }))
      vi.doMock('@/lib/email', () => ({ emailNovoPagamento: vi.fn() }))
      const flag = mockConflicts()

      const { POST } = await import('./route')
      await POST(fakeRequest({
        id: 'evt_sub_updated_fora_de_ordem',
        type: 'customer.subscription.updated',
        data: { object: { id: 'sub_recebida_agora', customer: 'cus_1', metadata: {}, items: { data: [{ price: { id: PRO_MONTHLY }, current_period_start: 1755302400, current_period_end: 1757980800 }] } } },
      }))

      expect(db.updatesByTable.professionals).toHaveLength(0)
      expect(flag).toHaveBeenCalledWith(expect.objectContaining({
        professionalId: 'prof-1', existingSubscriptionId: 'sub_antiga_diferente', newSubscriptionId: 'sub_recebida_agora',
        source: 'customer.subscription.updated', eventId: 'evt_sub_updated_fora_de_ordem',
      }))
    })

    it('mesmo ID (renovação/resync normal): nunca é tratado como conflito, atualiza normalmente', async () => {
      const retrieve = vi.fn().mockResolvedValue({
        metadata: {},
        customer: 'cus_1',
        items: { data: [{ price: { id: PRO_MONTHLY }, current_period_start: 1755302400, current_period_end: 1757980800 }] },
      })
      mockStripe({ retrieve })
      const db = mockDb({ professionalsByCustomer: [{ id: 'prof-1', stripe_subscription_id: 'sub_1' }] })
      vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: db.from } }))
      vi.doMock('@/lib/email', () => ({ emailNovoPagamento: vi.fn() }))
      const flag = mockConflicts()

      const { POST } = await import('./route')
      await POST(fakeRequest({
        id: 'evt_renovacao_mesmo_id',
        type: 'invoice.payment_succeeded',
        data: { object: { subscription: 'sub_1', billing_reason: 'subscription_cycle' } },
      }))

      expect(flag).not.toHaveBeenCalled()
      expect(db.updatesByTable.professionals).toContainEqual(expect.objectContaining({ plan: 'pro' }))
    })

    // Requisito 6 (revisão adversarial, 2026-09-19): nunca escolhe um
    // profissional ambiguamente quando 2+ linhas partilham o mesmo
    // stripe_customer_id (nunca deveria acontecer — há um índice único
    // parcial preparado na migração para prevenir isto ao nível da BD; este
    // teste cobre o comportamento defensivo enquanto isso não é garantido).
    it('customer ID associado ambiguamente a 2+ profissionais: nunca escolhe um arbitrariamente, não atualiza nada', async () => {
      const retrieve = vi.fn().mockResolvedValue({
        metadata: {},
        customer: 'cus_ambiguo',
        items: { data: [{ price: { id: PRO_MONTHLY }, current_period_start: 1755302400, current_period_end: 1757980800 }] },
      })
      mockStripe({ retrieve })
      const db = mockDb({ professionalsByCustomer: [{ id: 'prof-a', stripe_subscription_id: null }, { id: 'prof-b', stripe_subscription_id: null }] })
      vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: db.from } }))
      vi.doMock('@/lib/email', () => ({ emailNovoPagamento: vi.fn() }))
      const flag = mockConflicts()
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { POST } = await import('./route')
      await POST(fakeRequest({
        id: 'evt_customer_ambiguo',
        type: 'invoice.payment_succeeded',
        data: { object: { subscription: 'sub_1', billing_reason: 'subscription_cycle' } },
      }))

      expect(db.updatesByTable.professionals).toHaveLength(0)
      expect(flag).not.toHaveBeenCalled() // não há um único professional_id para associar ao conflito
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('cus_ambiguo'))
      errorSpy.mockRestore()
    })

    // Requisito 6: segundo sinal de identidade (subscription_data.metadata,
    // definido em app/api/stripe/checkout ao criar a sessão) — se
    // contradizer o que o stripe_customer_id encontrou, nunca ignora a
    // discrepância silenciosamente.
    it('metadata.professional_id da subscrição contradiz o profissional encontrado pelo stripe_customer_id: regista conflito, não atualiza', async () => {
      const retrieve = vi.fn()
      mockStripe({ retrieve })
      const db = mockDb({ professionalsByCustomer: [{ id: 'prof-encontrado', stripe_subscription_id: null }] })
      vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: db.from } }))
      vi.doMock('@/lib/email', () => ({ emailNovoPagamento: vi.fn() }))
      const flag = mockConflicts()

      const { POST } = await import('./route')
      await POST(fakeRequest({
        id: 'evt_metadata_contradiz',
        type: 'customer.subscription.updated',
        data: { object: { id: 'sub_1', customer: 'cus_1', metadata: { professional_id: 'prof-outro' }, items: { data: [{ price: { id: PRO_MONTHLY }, current_period_start: 1755302400, current_period_end: 1757980800 }] } } },
      }))

      expect(db.updatesByTable.professionals).toHaveLength(0)
      expect(flag).toHaveBeenCalledWith(expect.objectContaining({ professionalId: 'prof-encontrado' }))
    })
  })
})
