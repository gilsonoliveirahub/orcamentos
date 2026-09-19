import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

const ORIGINAL_ENV = { ...process.env }
const STARTER_PRICE_ID = 'price_1TPAO4LFTn4mze6d70qkDWAj'
const PRO_PRICE_ID = 'price_1TPAOELFTn4mze6dDaYx6snk'
// P5 (2026-09-19): Price IDs anuais reais, criados por Gilson no Stripe —
// usados só nos testes que precisam da env var configurada.
const STARTER_ANNUAL_PRICE_ID = 'price_1UHAsXLFTn4mze6dU5uk5YkJ'
const PRO_ANNUAL_PRICE_ID = 'price_1UHAuTLFTn4mze6d29nsPNiC'

function fakeRequest(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest
}

function mockStripe({
  retrieve, update, sessionsCreate, sessionsRetrieve, subscriptionsList,
  scheduleCreate, scheduleRetrieve, scheduleUpdate, scheduleRelease,
}: {
  retrieve?: ReturnType<typeof vi.fn>; update?: ReturnType<typeof vi.fn>; sessionsCreate?: ReturnType<typeof vi.fn>
  sessionsRetrieve?: ReturnType<typeof vi.fn>; subscriptionsList?: ReturnType<typeof vi.fn>
  scheduleCreate?: ReturnType<typeof vi.fn>; scheduleRetrieve?: ReturnType<typeof vi.fn>; scheduleUpdate?: ReturnType<typeof vi.fn>; scheduleRelease?: ReturnType<typeof vi.fn>
}) {
  vi.doMock('stripe', () => ({
    __esModule: true,
    default: vi.fn().mockImplementation(function StripeMock(this: unknown) {
      Object.assign(this as object, {
        subscriptions: { retrieve: retrieve ?? vi.fn(), update: update ?? vi.fn(), list: subscriptionsList ?? vi.fn().mockResolvedValue({ data: [], has_more: false }) },
        subscriptionSchedules: {
          create: scheduleCreate ?? vi.fn(),
          retrieve: scheduleRetrieve ?? vi.fn(),
          update: scheduleUpdate ?? vi.fn(),
          release: scheduleRelease ?? vi.fn(),
        },
        checkout: { sessions: { create: sessionsCreate ?? vi.fn(), retrieve: sessionsRetrieve ?? vi.fn() } },
      })
    }),
  }))
}

function mockProfessional(prof: unknown) {
  const updatePayloads: Record<string, unknown>[] = []
  const from = vi.fn((table: string) => {
    if (table !== 'professionals') throw new Error(`tabela inesperada: ${table}`)
    return {
      select: () => ({ eq: () => ({ single: async () => ({ data: prof }) }) }),
      update: (payload: Record<string, unknown>) => { updatePayloads.push(payload); return { eq: () => Promise.resolve({}) } },
    }
  })
  vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))
  return updatePayloads
}

// Reserva atómica (lib/checkout-lock.ts) e registo de conflitos
// (lib/subscription-conflicts.ts) — mockados diretamente ao nível do
// módulo; a atomicidade/lógica interna de cada peça já é testada em
// lib/checkout-lock.test.ts. Por omissão, a reserva é sempre concedida de
// imediato — os testes que precisam de simular "já existe uma reserva"
// passam um `acquire` próprio.
function mockCheckoutLock({
  acquire, attach, release, resumeStaleLock, replaceExpiredLock,
}: {
  acquire?: ReturnType<typeof vi.fn>
  attach?: ReturnType<typeof vi.fn>
  release?: ReturnType<typeof vi.fn>
  resumeStaleLock?: ReturnType<typeof vi.fn>
  replaceExpiredLock?: ReturnType<typeof vi.fn>
} = {}) {
  const acquireFn = acquire ?? vi.fn().mockResolvedValue({ ok: true, idempotencyKey: 'idem-test-key' })
  const attachFn = attach ?? vi.fn().mockResolvedValue(undefined)
  const releaseFn = release ?? vi.fn().mockResolvedValue(undefined)
  // Reimplementações reais (puras) por omissão — só os testes de
  // "reserva obsoleta"/"sessão expirada" precisam de as substituir.
  const resumeFn = resumeStaleLock ?? vi.fn((lock: { idempotency_key: string; plan: string; cycle: string }) => ({
    idempotencyKey: lock.idempotency_key, plan: lock.plan, cycle: lock.cycle,
  }))
  const replaceFn = replaceExpiredLock ?? vi.fn().mockResolvedValue({ replaced: true, idempotencyKey: 'idem-replaced' })
  vi.doMock('@/lib/checkout-lock', () => ({
    acquireCheckoutLock: acquireFn,
    attachCheckoutSession: attachFn,
    releaseCheckoutLock: releaseFn,
    resumeStaleLock: resumeFn,
    replaceExpiredLock: replaceFn,
    isLockStale: (lock: { created_at: string }, now: number = Date.now()) => now - new Date(lock.created_at).getTime() > 2 * 60 * 1000,
  }))
  return { acquireFn, attachFn, releaseFn, resumeFn, replaceFn }
}

function mockConflicts() {
  const flag = vi.fn().mockResolvedValue(undefined)
  vi.doMock('@/lib/subscription-conflicts', () => ({ flagSubscriptionConflict: flag }))
  return flag
}

// Uma sessão "válida" tem sempre metadata.professional_id/plan/cycle a
// corresponder exatamente à reserva que a criou (requisito 4) — helper para
// não repetir isto em cada teste que usa sessionsRetrieve.
function sessionFixture(overrides: Partial<{ status: string; url: string | null; metadata: Record<string, unknown> }> = {}) {
  return {
    status: 'open',
    url: null,
    metadata: { professional_id: 'prof-1', plan: 'starter', cycle: 'monthly' },
    ...overrides,
  }
}

describe('POST /api/stripe/checkout', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env = { ...ORIGINAL_ENV, STRIPE_SECRET_KEY: 'sk_test_fake' }
    mockCheckoutLock()
    mockConflicts()
  })
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.restoreAllMocks()
    vi.doUnmock('@/lib/supabase-admin')
    vi.doUnmock('@/lib/checkout-lock')
    vi.doUnmock('@/lib/subscription-conflicts')
    vi.doUnmock('stripe')
  })

  it('sem subscrição existente: cria uma sessão de Checkout normal (primeira assinatura)', async () => {
    const sessionsCreate = vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/session-1' })
    mockStripe({ sessionsCreate })
    mockProfessional({ id: 'prof-1', email: 'prof@example.com', plan: null, stripe_customer_id: null, stripe_subscription_id: null })

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ professional_id: 'prof-1', plan: 'starter' }))
    const json = await res.json()

    expect(json.url).toBe('https://checkout.stripe.com/session-1')
    expect(sessionsCreate).toHaveBeenCalledTimes(1)
    expect(sessionsCreate.mock.calls[0][0]).toEqual(expect.objectContaining({ customer_email: 'prof@example.com' }))
    expect(sessionsCreate.mock.calls[0][0]).not.toHaveProperty('customer')
    // Requisito 6: subscription_data.metadata propaga a identidade para a
    // própria Subscription, para o webhook a poder cruzar depois.
    expect(sessionsCreate.mock.calls[0][0].subscription_data).toEqual({ metadata: { professional_id: 'prof-1', plan: 'starter', cycle: 'monthly' } })
    // checkout_idempotency_key na metadata — usado pelo webhook para
    // libertar a reserva certa (requisito 2).
    expect(sessionsCreate.mock.calls[0][0].metadata).toMatchObject({ checkout_idempotency_key: expect.any(String) })
  })

  // P5 (2026-09-19): planos anuais. Os 4 pares plano/ciclo, cada um com o
  // Price ID certo — nunca inventado, sempre de lib/stripe-plans.ts.
  describe('os 4 pares plano/ciclo', () => {
    const cases: Array<{ plan: string; cycle: string; priceId: string }> = [
      { plan: 'starter', cycle: 'monthly', priceId: STARTER_PRICE_ID },
      { plan: 'pro', cycle: 'monthly', priceId: PRO_PRICE_ID },
      { plan: 'starter', cycle: 'annual', priceId: STARTER_ANNUAL_PRICE_ID },
      { plan: 'pro', cycle: 'annual', priceId: PRO_ANNUAL_PRICE_ID },
    ]

    for (const { plan, cycle, priceId } of cases) {
      it(`plan=${plan} cycle=${cycle} -> usa ${priceId}, com automatic_tax ativo`, async () => {
        process.env.STRIPE_PRICE_STARTER_ANNUAL = STARTER_ANNUAL_PRICE_ID
        process.env.STRIPE_PRICE_PRO_ANNUAL = PRO_ANNUAL_PRICE_ID
        const sessionsCreate = vi.fn().mockResolvedValue({ url: `https://checkout.stripe.com/${plan}-${cycle}` })
        mockStripe({ sessionsCreate })
        mockProfessional({ id: 'prof-1', email: 'prof@example.com', plan: null, stripe_customer_id: null, stripe_subscription_id: null })

        const { POST } = await import('./route')
        const res = await POST(fakeRequest({ professional_id: 'prof-1', plan, cycle }))
        const json = await res.json()

        expect(json.url).toBe(`https://checkout.stripe.com/${plan}-${cycle}`)
        const call = sessionsCreate.mock.calls[0][0]
        expect(call.line_items[0].price).toBe(priceId)
        expect(call.metadata).toMatchObject({ plan, cycle })
        expect(call.automatic_tax).toEqual({ enabled: true })
        expect(call.mode).toBe('subscription')
      })
    }

    it('cycle omitido -> "monthly" por omissão (compatibilidade total com o comportamento anterior)', async () => {
      const sessionsCreate = vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/default' })
      mockStripe({ sessionsCreate })
      mockProfessional({ id: 'prof-1', email: 'prof@example.com', plan: null, stripe_customer_id: null, stripe_subscription_id: null })

      const { POST } = await import('./route')
      const res = await POST(fakeRequest({ professional_id: 'prof-1', plan: 'starter' }))
      const json = await res.json()

      expect(json.url).toBe('https://checkout.stripe.com/default')
      expect(sessionsCreate.mock.calls[0][0].line_items[0].price).toBe(STARTER_PRICE_ID)
      expect(sessionsCreate.mock.calls[0][0].metadata).toMatchObject({ plan: 'starter', cycle: 'monthly' })
    })
  })

  it('recusa um ciclo inválido, sem chamar o Stripe', async () => {
    const sessionsCreate = vi.fn()
    mockStripe({ sessionsCreate })
    mockProfessional({ id: 'prof-1', email: 'prof@example.com', plan: null, stripe_customer_id: null, stripe_subscription_id: null })

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ professional_id: 'prof-1', plan: 'starter', cycle: 'semestral' }))

    expect(res.status).toBe(400)
    expect(sessionsCreate).not.toHaveBeenCalled()
  })

  it('recusa um plano inválido, sem chamar o Stripe', async () => {
    const sessionsCreate = vi.fn()
    mockStripe({ sessionsCreate })
    mockProfessional({ id: 'prof-1', email: 'prof@example.com', plan: null, stripe_customer_id: null, stripe_subscription_id: null })

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ professional_id: 'prof-1', plan: 'premium', cycle: 'monthly' }))

    expect(res.status).toBe(400)
    expect(sessionsCreate).not.toHaveBeenCalled()
  })

  it('ciclo anual pedido sem a variável de ambiente configurada: erro claro (501), nunca cai no mensal', async () => {
    delete process.env.STRIPE_PRICE_STARTER_ANNUAL
    const sessionsCreate = vi.fn()
    mockStripe({ sessionsCreate })
    mockProfessional({ id: 'prof-1', email: 'prof@example.com', plan: null, stripe_customer_id: null, stripe_subscription_id: null })

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ professional_id: 'prof-1', plan: 'starter', cycle: 'annual' }))
    const json = await res.json()

    expect(res.status).toBe(501)
    expect(json.error).toMatch(/Price ID/)
    expect(sessionsCreate).not.toHaveBeenCalled()
  })

  it('nunca aceita um Price ID (ou qualquer outro valor) enviado no corpo do pedido — só plan+cycle decidem o preço', async () => {
    process.env.STRIPE_PRICE_STARTER_ANNUAL = STARTER_ANNUAL_PRICE_ID
    const sessionsCreate = vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/safe' })
    mockStripe({ sessionsCreate })
    mockProfessional({ id: 'prof-1', email: 'prof@example.com', plan: null, stripe_customer_id: null, stripe_subscription_id: null })

    const { POST } = await import('./route')
    await POST(fakeRequest({
      professional_id: 'prof-1', plan: 'starter', cycle: 'monthly',
      priceId: 'price_forjado_pelo_browser', price: 'price_forjado_pelo_browser', unit_amount: 1,
    }))

    // O único Price ID que pode ter ido para o Stripe é o resolvido no
    // servidor a partir de plan+cycle — nunca o forjado.
    expect(sessionsCreate.mock.calls[0][0].line_items[0].price).toBe(STARTER_PRICE_ID)
  })

  it('reassinatura depois de um cancelamento (stripe_subscription_id limpo mas stripe_customer_id mantido): reutiliza o Customer existente, sem criar um duplicado', async () => {
    const retrieve = vi.fn()
    const update = vi.fn()
    const sessionsCreate = vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/session-2' })
    const subscriptionsList = vi.fn().mockResolvedValue({ data: [], has_more: false })
    mockStripe({ retrieve, update, sessionsCreate, subscriptionsList })
    mockProfessional({ id: 'prof-1', email: 'prof@example.com', plan: 'inactive', stripe_customer_id: 'cus_1', stripe_subscription_id: null })

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ professional_id: 'prof-1', plan: 'starter' }))
    const json = await res.json()

    expect(json.url).toBe('https://checkout.stripe.com/session-2')
    expect(retrieve).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
    expect(subscriptionsList).toHaveBeenCalledWith(expect.objectContaining({ customer: 'cus_1' }))
    expect(sessionsCreate.mock.calls[0][0]).toEqual(expect.objectContaining({ customer: 'cus_1' }))
    expect(sessionsCreate.mock.calls[0][0]).not.toHaveProperty('customer_email')
  })

  it('já tem este plano E este ciclo ativos (mesmo Price ID real na subscrição): recusa, nunca chama update/schedule', async () => {
    const retrieve = vi.fn().mockResolvedValue({ items: { data: [{ id: 'si_1', price: { id: STARTER_PRICE_ID } }] }, schedule: null })
    const update = vi.fn()
    mockStripe({ retrieve, update })
    mockProfessional({ id: 'prof-1', email: 'prof@example.com', plan: 'starter', stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_1' })

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ professional_id: 'prof-1', plan: 'starter', cycle: 'monthly' }))
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toMatch(/plano e ciclo/i)
    expect(update).not.toHaveBeenCalled()
  })

  it('P5 (2026-09-19): mesmo tier, ciclo diferente (Starter mensal -> Starter anual) NÃO é bloqueado como "já tens este plano" — decide pelo Price ID real, não só pelo tier', async () => {
    process.env.STRIPE_PRICE_STARTER_ANNUAL = STARTER_ANNUAL_PRICE_ID
    const retrieve = vi.fn().mockResolvedValue({ items: { data: [{ id: 'si_1', price: { id: STARTER_PRICE_ID }, current_period_end: 1757980800 } ] }, schedule: null })
    const scheduleCreate = vi.fn().mockResolvedValue({ id: 'sub_sched_1', phases: [{ start_date: 1755302400, items: [{ price: STARTER_PRICE_ID }] }] })
    const scheduleUpdate = vi.fn().mockResolvedValue({ id: 'sub_sched_1' })
    mockStripe({ retrieve, scheduleCreate, scheduleUpdate })
    mockProfessional({ id: 'prof-1', email: 'prof@example.com', plan: 'starter', stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_1' })

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ professional_id: 'prof-1', plan: 'starter', cycle: 'annual' }))
    const json = await res.json()

    expect(json).toEqual({ ok: true, deferred: true })
    expect(scheduleUpdate).toHaveBeenCalledWith('sub_sched_1', expect.objectContaining({
      phases: expect.arrayContaining([
        expect.objectContaining({ items: [{ price: STARTER_ANNUAL_PRICE_ID }] }),
      ]),
    }))
  })

  it('upgrade Starter→Pro com subscrição existente: atualiza a MESMA subscrição com proration, nunca cria uma segunda', async () => {
    const retrieve = vi.fn().mockResolvedValue({ items: { data: [{ id: 'si_1' }] }, schedule: null })
    const update = vi.fn().mockResolvedValue({
      items: { data: [{ price: { id: PRO_PRICE_ID }, current_period_start: 1755302400, current_period_end: 1757980800 }] },
    })
    const sessionsCreate = vi.fn()
    mockStripe({ retrieve, update, sessionsCreate })
    const updatePayloads = mockProfessional({ id: 'prof-1', email: 'prof@example.com', plan: 'starter', stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_1' })

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ professional_id: 'prof-1', plan: 'pro' }))
    const json = await res.json()

    expect(json).toEqual({ ok: true })
    expect(sessionsCreate).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalledWith('sub_1', {
      items: [{ id: 'si_1', price: PRO_PRICE_ID }],
      proration_behavior: 'create_prorations',
      payment_behavior: 'error_if_incomplete',
    }, { idempotencyKey: expect.any(String) })
    expect(updatePayloads[0]).toMatchObject({
      plan: 'pro',
      pending_plan: null,
      current_period_start: new Date(1755302400 * 1000).toISOString(),
      current_period_end: new Date(1757980800 * 1000).toISOString(),
    })
  })

  it('upgrade com pagamento da proration falhado: não escreve NADA — mantém Starter e o consumo do ciclo intactos', async () => {
    const retrieve = vi.fn().mockResolvedValue({ items: { data: [{ id: 'si_1' }] }, schedule: null })
    const update = vi.fn().mockRejectedValue(new Error('Your card was declined.'))
    mockStripe({ retrieve, update })
    const updatePayloads = mockProfessional({ id: 'prof-1', email: 'prof@example.com', plan: 'starter', stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_1' })

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ professional_id: 'prof-1', plan: 'pro' }))
    const json = await res.json()

    expect(res.status).toBe(402)
    expect(json.error).toContain('declined')
    expect(updatePayloads).toHaveLength(0)
  })

  it('upgrade com downgrade agendado (Subscription Schedule ativa): liberta a agenda antes de atualizar a subscrição', async () => {
    const retrieve = vi.fn().mockResolvedValue({ items: { data: [{ id: 'si_1' }] }, schedule: 'sub_sched_1' })
    const update = vi.fn().mockResolvedValue({ items: { data: [{ price: { id: PRO_PRICE_ID }, current_period_start: 1755302400, current_period_end: 1757980800 }] } })
    const scheduleRelease = vi.fn().mockResolvedValue({})
    mockStripe({ retrieve, update, scheduleRelease })
    mockProfessional({ id: 'prof-1', email: 'prof@example.com', plan: 'starter', stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_1' })

    const { POST } = await import('./route')
    await POST(fakeRequest({ professional_id: 'prof-1', plan: 'pro' }))

    expect(scheduleRelease).toHaveBeenCalledWith('sub_sched_1')
  })

  describe('downgrade Pro→Starter — agendado via Subscription Schedule para a renovação, nunca aplicado agora', () => {
    it('cria uma Subscription Schedule com 2 fases: preço atual até ao fim do ciclo pago, preço Starter a partir daí — NUNCA chama subscriptions.update', async () => {
      const retrieve = vi.fn().mockResolvedValue({
        items: { data: [{ id: 'si_1', price: { id: PRO_PRICE_ID }, current_period_end: 1757980800 }] },
        schedule: null,
      })
      const update = vi.fn()
      const scheduleCreate = vi.fn().mockResolvedValue({
        id: 'sub_sched_1',
        phases: [{ start_date: 1755302400, items: [{ price: PRO_PRICE_ID }] }],
      })
      const scheduleUpdate = vi.fn().mockResolvedValue({ id: 'sub_sched_1' })
      mockStripe({ retrieve, update, scheduleCreate, scheduleUpdate })
      const updatePayloads = mockProfessional({ id: 'prof-1', email: 'prof@example.com', plan: 'pro', stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_1' })

      const { POST } = await import('./route')
      const res = await POST(fakeRequest({ professional_id: 'prof-1', plan: 'starter' }))
      const json = await res.json()

      expect(json).toEqual({ ok: true, deferred: true })
      expect(update).not.toHaveBeenCalled()
      expect(scheduleCreate).toHaveBeenCalledWith({ from_subscription: 'sub_1' })
      expect(scheduleUpdate).toHaveBeenCalledWith('sub_sched_1', {
        end_behavior: 'release',
        phases: [
          { items: [{ price: PRO_PRICE_ID }], start_date: 1755302400, end_date: 1757980800 },
          { items: [{ price: STARTER_PRICE_ID }], start_date: 1757980800 },
        ],
      })
      expect(updatePayloads).toEqual([{ pending_plan: 'starter' }])
    })

    it('reutiliza a Subscription Schedule existente em vez de criar uma nova, se já houver uma associada à subscrição', async () => {
      const retrieve = vi.fn().mockResolvedValue({
        items: { data: [{ id: 'si_1', price: { id: PRO_PRICE_ID }, current_period_end: 1757980800 }] },
        schedule: 'sub_sched_existente',
      })
      const scheduleCreate = vi.fn()
      const scheduleRetrieve = vi.fn().mockResolvedValue({ id: 'sub_sched_existente', phases: [{ start_date: 1755302400, items: [{ price: PRO_PRICE_ID }] }] })
      const scheduleUpdate = vi.fn().mockResolvedValue({ id: 'sub_sched_existente' })
      mockStripe({ retrieve, scheduleCreate, scheduleRetrieve, scheduleUpdate })
      mockProfessional({ id: 'prof-1', email: 'prof@example.com', plan: 'pro', stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_1' })

      const { POST } = await import('./route')
      await POST(fakeRequest({ professional_id: 'prof-1', plan: 'starter' }))

      expect(scheduleCreate).not.toHaveBeenCalled()
      expect(scheduleRetrieve).toHaveBeenCalledWith('sub_sched_existente')
      expect(scheduleUpdate).toHaveBeenCalledWith('sub_sched_existente', expect.anything())
    })

    it('a base de dados NUNCA fica com plan=starter no momento do pedido — só pending_plan muda, plan continua pro até o Stripe confirmar a transição', async () => {
      const retrieve = vi.fn().mockResolvedValue({
        items: { data: [{ id: 'si_1', price: { id: PRO_PRICE_ID }, current_period_end: 1757980800 }] },
        schedule: null,
      })
      const scheduleCreate = vi.fn().mockResolvedValue({ id: 'sub_sched_1', phases: [{ start_date: 1755302400, items: [{ price: PRO_PRICE_ID }] }] })
      const scheduleUpdate = vi.fn().mockResolvedValue({ id: 'sub_sched_1' })
      mockStripe({ retrieve, scheduleCreate, scheduleUpdate })
      const updatePayloads = mockProfessional({ id: 'prof-1', email: 'prof@example.com', plan: 'pro', stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_1' })

      const { POST } = await import('./route')
      await POST(fakeRequest({ professional_id: 'prof-1', plan: 'starter' }))

      expect(updatePayloads).toEqual([{ pending_plan: 'starter' }])
      expect(updatePayloads.some(p => 'plan' in p)).toBe(false)
    })

    it('falha ao agendar no Stripe: não escreve pending_plan (evita ficar com uma intenção que o Stripe não tem)', async () => {
      const retrieve = vi.fn().mockResolvedValue({
        items: { data: [{ id: 'si_1', price: { id: PRO_PRICE_ID }, current_period_end: 1757980800 }] },
        schedule: null,
      })
      const scheduleCreate = vi.fn().mockRejectedValue(new Error('Stripe indisponível'))
      mockStripe({ retrieve, scheduleCreate })
      const updatePayloads = mockProfessional({ id: 'prof-1', email: 'prof@example.com', plan: 'pro', stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_1' })

      const { POST } = await import('./route')
      const res = await POST(fakeRequest({ professional_id: 'prof-1', plan: 'starter' }))

      expect(res.status).toBe(500)
      expect(updatePayloads).toHaveLength(0)
    })
  })

  // Proteção contra dupla subscrição (2026-09-19, decisão de negócio) +
  // revisão adversarial (2026-09-19, segunda passagem) — cobre exatamente
  // os casos pedidos: duplo clique, retry, sessão expirada, reserva
  // obsoleta (retomada com a MESMA chave, nunca uma nova), reconciliação
  // com paginação, e falha na escrita local depois de o Stripe já ter
  // criado a sessão.
  describe('proteção contra dupla subscrição', () => {
    it('duplo clique / pedido concorrente: reserva já ocupada e ainda recente (sem sessão) → 409, nunca chama o Stripe', async () => {
      const busyLock = { professional_id: 'prof-1', idempotency_key: 'k', plan: 'starter', cycle: 'monthly', checkout_session_id: null, created_at: new Date().toISOString() }
      mockCheckoutLock({ acquire: vi.fn().mockResolvedValue({ ok: false, lock: busyLock }) })
      const sessionsCreate = vi.fn()
      const sessionsRetrieve = vi.fn()
      mockStripe({ sessionsCreate, sessionsRetrieve })
      mockProfessional({ id: 'prof-1', email: 'prof@example.com', plan: null, stripe_customer_id: null, stripe_subscription_id: null })

      const { POST } = await import('./route')
      const res = await POST(fakeRequest({ professional_id: 'prof-1', plan: 'starter' }))

      expect(res.status).toBe(409)
      expect(sessionsCreate).not.toHaveBeenCalled()
      expect(sessionsRetrieve).not.toHaveBeenCalled()
    })

    it('retry do mesmo pedido enquanto a sessão anterior ainda está aberta (mesmo plano/ciclo): devolve a MESMA URL, nunca cria uma segunda sessão', async () => {
      const busyLock = { professional_id: 'prof-1', idempotency_key: 'k', plan: 'starter', cycle: 'monthly', checkout_session_id: 'cs_pendente', created_at: new Date().toISOString() }
      mockCheckoutLock({ acquire: vi.fn().mockResolvedValue({ ok: false, lock: busyLock }) })
      const sessionsCreate = vi.fn()
      const sessionsRetrieve = vi.fn().mockResolvedValue(sessionFixture({ status: 'open', url: 'https://checkout.stripe.com/pendente' }))
      mockStripe({ sessionsCreate, sessionsRetrieve })
      mockProfessional({ id: 'prof-1', email: 'prof@example.com', plan: null, stripe_customer_id: null, stripe_subscription_id: null })

      const { POST } = await import('./route')
      const res = await POST(fakeRequest({ professional_id: 'prof-1', plan: 'starter', cycle: 'monthly' }))
      const json = await res.json()

      expect(sessionsRetrieve).toHaveBeenCalledWith('cs_pendente')
      expect(json.url).toBe('https://checkout.stripe.com/pendente')
      expect(sessionsCreate).not.toHaveBeenCalled()
    })

    // Requisito 4 e requisito 10 ("sessão existente pertence a outro
    // plano/ciclo"): a sessão pendente é real e válida, mas para uma
    // operação DIFERENTE da que este pedido concreto está a escolher agora
    // — nunca troca "por baixo" de uma operação em curso.
    it('sessão pendente aberta pertence a um plano/ciclo DIFERENTE do pedido atual: 409, nunca devolve essa URL como se fosse o que foi pedido', async () => {
      const busyLock = { professional_id: 'prof-1', idempotency_key: 'k', plan: 'pro', cycle: 'annual', checkout_session_id: 'cs_outro_plano', created_at: new Date().toISOString() }
      mockCheckoutLock({ acquire: vi.fn().mockResolvedValue({ ok: false, lock: busyLock }) })
      const sessionsCreate = vi.fn()
      const sessionsRetrieve = vi.fn().mockResolvedValue(sessionFixture({ status: 'open', metadata: { professional_id: 'prof-1', plan: 'pro', cycle: 'annual' } }))
      mockStripe({ sessionsCreate, sessionsRetrieve })
      mockProfessional({ id: 'prof-1', email: 'prof@example.com', plan: null, stripe_customer_id: null, stripe_subscription_id: null })

      const { POST } = await import('./route')
      // Pede Starter mensal, mas a reserva/sessão pendente é de Pro anual.
      const res = await POST(fakeRequest({ professional_id: 'prof-1', plan: 'starter', cycle: 'monthly' }))

      expect(res.status).toBe(409)
      expect(sessionsCreate).not.toHaveBeenCalled()
    })

    // Requisito 4 e requisito 10 ("sessão pertence a outro cliente"): a
    // sessão associada à reserva não tem os metadados que deveria ter —
    // nunca confia só na existência do session_id.
    it('sessão associada à reserva não tem os metadados esperados (professional_id/plan/cycle não correspondem): nunca reutiliza, regista para revisão', async () => {
      const busyLock = { professional_id: 'prof-1', idempotency_key: 'k', plan: 'starter', cycle: 'monthly', checkout_session_id: 'cs_suspeita', created_at: new Date().toISOString() }
      mockCheckoutLock({ acquire: vi.fn().mockResolvedValue({ ok: false, lock: busyLock }) })
      const sessionsCreate = vi.fn()
      const sessionsRetrieve = vi.fn().mockResolvedValue({ ...sessionFixture({ status: 'open', metadata: { professional_id: 'prof-OUTRO', plan: 'starter', cycle: 'monthly' } }), id: 'cs_suspeita' })
      mockStripe({ sessionsCreate, sessionsRetrieve })
      mockProfessional({ id: 'prof-1', email: 'prof@example.com', plan: null, stripe_customer_id: null, stripe_subscription_id: null })
      const flag = mockConflicts()

      const { POST } = await import('./route')
      const res = await POST(fakeRequest({ professional_id: 'prof-1', plan: 'starter', cycle: 'monthly' }))

      expect(res.status).toBe(409)
      expect(sessionsCreate).not.toHaveBeenCalled()
      expect(flag).toHaveBeenCalledWith(expect.objectContaining({ newSubscriptionId: 'cs_suspeita' }))
    })

    it('retry tardio depois de a sessão já ter sido concluída → recusa com mensagem clara, nunca cria uma segunda sessão', async () => {
      const busyLock = { professional_id: 'prof-1', idempotency_key: 'k', plan: 'starter', cycle: 'monthly', checkout_session_id: 'cs_concluida', created_at: new Date().toISOString() }
      mockCheckoutLock({ acquire: vi.fn().mockResolvedValue({ ok: false, lock: busyLock }) })
      const sessionsCreate = vi.fn()
      const sessionsRetrieve = vi.fn().mockResolvedValue(sessionFixture({ status: 'complete' }))
      mockStripe({ sessionsCreate, sessionsRetrieve })
      mockProfessional({ id: 'prof-1', email: 'prof@example.com', plan: null, stripe_customer_id: null, stripe_subscription_id: null })

      const { POST } = await import('./route')
      const res = await POST(fakeRequest({ professional_id: 'prof-1', plan: 'starter' }))
      const json = await res.json()

      expect(res.status).toBe(400)
      expect(json.error).toMatch(/já foi concluído/)
      expect(sessionsCreate).not.toHaveBeenCalled()
    })

    it('sessão anterior expirou → substitui a reserva de forma atómica (replaceExpiredLock) e cria uma sessão nova, com chave nova', async () => {
      const expiredLock = { professional_id: 'prof-1', idempotency_key: 'k-antiga', plan: 'starter', cycle: 'monthly', checkout_session_id: 'cs_expirada', created_at: new Date().toISOString() }
      const acquire = vi.fn().mockResolvedValue({ ok: false, lock: expiredLock })
      const replaceExpiredLock = vi.fn().mockResolvedValue({ replaced: true, idempotencyKey: 'idem-fresca' })
      const attach = vi.fn().mockResolvedValue(undefined)
      mockCheckoutLock({ acquire, attach, replaceExpiredLock })
      const sessionsRetrieve = vi.fn().mockResolvedValue(sessionFixture({ status: 'expired' }))
      const sessionsCreate = vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/fresca', id: 'cs_nova' })
      mockStripe({ sessionsCreate, sessionsRetrieve })
      mockProfessional({ id: 'prof-1', email: 'prof@example.com', plan: null, stripe_customer_id: null, stripe_subscription_id: null })

      const { POST } = await import('./route')
      const res = await POST(fakeRequest({ professional_id: 'prof-1', plan: 'starter', cycle: 'monthly' }))
      const json = await res.json()

      expect(replaceExpiredLock).toHaveBeenCalledWith('prof-1', 'k-antiga', 'starter', 'monthly')
      expect(json.url).toBe('https://checkout.stripe.com/fresca')
      expect(attach).toHaveBeenCalledWith('prof-1', 'idem-fresca', 'cs_nova')
      expect(sessionsCreate.mock.calls[0][0]).toEqual(expect.objectContaining({
        metadata: expect.objectContaining({ checkout_idempotency_key: 'idem-fresca' }),
      }))
    })

    it('sessão expirada, mas a troca atómica perde a corrida (outro pedido já tratou disto): repete a resolução do zero em vez de assumir que ganhou', async () => {
      const expiredLock = { professional_id: 'prof-1', idempotency_key: 'k-antiga', plan: 'starter', cycle: 'monthly', checkout_session_id: 'cs_expirada', created_at: new Date().toISOString() }
      const openLockDaOutraPessoa = { professional_id: 'prof-1', idempotency_key: 'k-de-outro-pedido', plan: 'starter', cycle: 'monthly', checkout_session_id: 'cs_do_outro_pedido', created_at: new Date().toISOString() }
      const acquire = vi.fn()
        .mockResolvedValueOnce({ ok: false, lock: expiredLock })
        .mockResolvedValueOnce({ ok: false, lock: openLockDaOutraPessoa })
      const replaceExpiredLock = vi.fn().mockResolvedValue({ replaced: false, idempotencyKey: 'k-de-outro-pedido' })
      mockCheckoutLock({ acquire, replaceExpiredLock })
      const sessionsRetrieve = vi.fn()
        .mockResolvedValueOnce(sessionFixture({ status: 'expired' }))
        .mockResolvedValueOnce(sessionFixture({ status: 'open', url: 'https://checkout.stripe.com/do-outro-pedido' }))
      const sessionsCreate = vi.fn()
      mockStripe({ sessionsCreate, sessionsRetrieve })
      mockProfessional({ id: 'prof-1', email: 'prof@example.com', plan: null, stripe_customer_id: null, stripe_subscription_id: null })

      const { POST } = await import('./route')
      const res = await POST(fakeRequest({ professional_id: 'prof-1', plan: 'starter', cycle: 'monthly' }))
      const json = await res.json()

      expect(acquire).toHaveBeenCalledTimes(2)
      expect(json.url).toBe('https://checkout.stripe.com/do-outro-pedido')
      expect(sessionsCreate).not.toHaveBeenCalled()
    })

    // Requisito 1: reserva obsoleta SEM sessão associada — retoma a MESMA
    // operação (mesma chave, mesmo plano/ciclo), nunca gera uma chave nova
    // nem apaga/recria a reserva.
    it('reserva obsoleta sem sessão associada: retoma a MESMA operação (mesma idempotencyKey), nunca uma chave nova', async () => {
      const staleLock = {
        professional_id: 'prof-1', idempotency_key: 'k-morta', plan: 'starter', cycle: 'monthly',
        checkout_session_id: null, created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      }
      const acquire = vi.fn().mockResolvedValue({ ok: false, lock: staleLock })
      const attach = vi.fn().mockResolvedValue(undefined)
      const release = vi.fn().mockResolvedValue(undefined)
      mockCheckoutLock({ acquire, attach, release })
      const sessionsCreate = vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/retomada', id: 'cs_retomada' })
      mockStripe({ sessionsCreate })
      mockProfessional({ id: 'prof-1', email: 'prof@example.com', plan: null, stripe_customer_id: null, stripe_subscription_id: null })

      const { POST } = await import('./route')
      // O pedido atual até podia pedir outra coisa — a operação retomada é
      // a que já estava presa na reserva (mesmo plano/ciclo aqui, de
      // propósito, para isolar só o requisito da chave).
      const res = await POST(fakeRequest({ professional_id: 'prof-1', plan: 'starter', cycle: 'monthly' }))
      const json = await res.json()

      expect(acquire).toHaveBeenCalledTimes(1) // nunca tenta reservar de novo
      expect(json.url).toBe('https://checkout.stripe.com/retomada')
      expect(sessionsCreate.mock.calls[0][0]).toEqual(expect.objectContaining({
        metadata: expect.objectContaining({ checkout_idempotency_key: 'k-morta' }),
      }))
      expect(attach).toHaveBeenCalledWith('prof-1', 'k-morta', 'cs_retomada')
      expect(release).not.toHaveBeenCalled() // sessão criada com sucesso -> mantém a reserva até o webhook
    })

    it('reserva obsoleta retomada era para um plano/ciclo DIFERENTE do pedido atual: completa a operação retomada, mas avisa que não é o que foi pedido agora', async () => {
      process.env.STRIPE_PRICE_PRO_ANNUAL = PRO_ANNUAL_PRICE_ID
      const staleLock = {
        professional_id: 'prof-1', idempotency_key: 'k-morta', plan: 'pro', cycle: 'annual',
        checkout_session_id: null, created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      }
      const acquire = vi.fn().mockResolvedValue({ ok: false, lock: staleLock })
      mockCheckoutLock({ acquire })
      const sessionsCreate = vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/retomada-pro-anual', id: 'cs_retomada' })
      mockStripe({ sessionsCreate })
      mockProfessional({ id: 'prof-1', email: 'prof@example.com', plan: null, stripe_customer_id: null, stripe_subscription_id: null })

      const { POST } = await import('./route')
      // Pedido atual é Starter mensal — a operação retomada (Pro anual) é
      // completada de qualquer forma (nunca se perde nem duplica), mas a
      // resposta a ESTE pedido não pode fingir que foi Starter mensal.
      const res = await POST(fakeRequest({ professional_id: 'prof-1', plan: 'starter', cycle: 'monthly' }))
      const json = await res.json()

      expect(sessionsCreate.mock.calls[0][0].line_items[0].price).toBe(PRO_ANNUAL_PRICE_ID)
      expect(res.status).toBe(409)
      expect(json.url).toBeUndefined()
    })

    it('reserva sem sessão mas ainda recente (pedido irmão pode estar mesmo a meio): 409, nunca liberta nem cria nada', async () => {
      const freshLock = {
        professional_id: 'prof-1', idempotency_key: 'k-viva', plan: 'starter', cycle: 'monthly',
        checkout_session_id: null, created_at: new Date().toISOString(),
      }
      const acquire = vi.fn().mockResolvedValue({ ok: false, lock: freshLock })
      const release = vi.fn()
      mockCheckoutLock({ acquire, release })
      const sessionsCreate = vi.fn()
      mockStripe({ sessionsCreate })
      mockProfessional({ id: 'prof-1', email: 'prof@example.com', plan: null, stripe_customer_id: null, stripe_subscription_id: null })

      const { POST } = await import('./route')
      const res = await POST(fakeRequest({ professional_id: 'prof-1', plan: 'starter' }))

      expect(res.status).toBe(409)
      expect(release).not.toHaveBeenCalled()
      expect(sessionsCreate).not.toHaveBeenCalled()
    })

    it('reconciliação: já existe 1 subscrição não terminada no Stripe que a BD não conhecia → reconcilia a BD e recusa criar outra sessão', async () => {
      const release = vi.fn().mockResolvedValue(undefined)
      mockCheckoutLock({ release })
      const subscriptionsList = vi.fn().mockResolvedValue({
        data: [{
          id: 'sub_existente', status: 'active',
          items: { data: [{ price: { id: PRO_PRICE_ID }, current_period_start: 1755302400, current_period_end: 1757980800 }] },
        }],
        has_more: false,
      })
      const sessionsCreate = vi.fn()
      mockStripe({ sessionsCreate, subscriptionsList })
      const updatePayloads = mockProfessional({ id: 'prof-1', email: 'prof@example.com', plan: null, stripe_customer_id: 'cus_1', stripe_subscription_id: null })

      const { POST } = await import('./route')
      const res = await POST(fakeRequest({ professional_id: 'prof-1', plan: 'starter' }))
      const json = await res.json()

      expect(res.status).toBe(400)
      expect(json.error).toMatch(/já tens uma subscrição ativa/i)
      expect(sessionsCreate).not.toHaveBeenCalled()
      expect(updatePayloads[0]).toMatchObject({ plan: 'pro', stripe_subscription_id: 'sub_existente' })
      expect(release).toHaveBeenCalledWith('prof-1', 'idem-test-key')
    })

    it('reconciliação: 2+ subscrições não terminadas para o mesmo cliente → regista conflito e recusa, nunca escolhe qual é a legítima', async () => {
      const release = vi.fn().mockResolvedValue(undefined)
      mockCheckoutLock({ release })
      const flag = mockConflicts()
      const subscriptionsList = vi.fn().mockResolvedValue({
        data: [
          { id: 'sub_a', status: 'active', items: { data: [{ price: { id: STARTER_PRICE_ID } }] } },
          { id: 'sub_b', status: 'past_due', items: { data: [{ price: { id: PRO_PRICE_ID } }] } },
        ],
        has_more: false,
      })
      const sessionsCreate = vi.fn()
      mockStripe({ sessionsCreate, subscriptionsList })
      mockProfessional({ id: 'prof-1', email: 'prof@example.com', plan: null, stripe_customer_id: 'cus_1', stripe_subscription_id: null })

      const { POST } = await import('./route')
      const res = await POST(fakeRequest({ professional_id: 'prof-1', plan: 'starter' }))
      const json = await res.json()

      expect(res.status).toBe(409)
      expect(json.error).toMatch(/mais do que uma subscrição/i)
      expect(sessionsCreate).not.toHaveBeenCalled()
      expect(flag).toHaveBeenCalledWith(expect.objectContaining({
        professionalId: 'prof-1', source: 'checkout_reconciliation', newSubscriptionId: 'sub_a,sub_b',
      }))
      expect(release).toHaveBeenCalledWith('prof-1', 'idem-test-key')
    })

    it('reconciliação ignora subscrições já terminadas (canceled/incomplete_expired) — não bloqueia nem reconcilia com elas', async () => {
      const subscriptionsList = vi.fn().mockResolvedValue({
        data: [{ id: 'sub_cancelada', status: 'canceled', items: { data: [{ price: { id: STARTER_PRICE_ID } }] } }],
        has_more: false,
      })
      const sessionsCreate = vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/nova', id: 'cs_nova' })
      mockStripe({ sessionsCreate, subscriptionsList })
      mockProfessional({ id: 'prof-1', email: 'prof@example.com', plan: null, stripe_customer_id: 'cus_1', stripe_subscription_id: null })

      const { POST } = await import('./route')
      const res = await POST(fakeRequest({ professional_id: 'prof-1', plan: 'starter' }))
      const json = await res.json()

      expect(json.url).toBe('https://checkout.stripe.com/nova')
    })

    // Requisito 5 e requisito 10 ("mais de uma página de subscrições"):
    // nunca verifica só a primeira página.
    it('reconciliação percorre TODAS as páginas de subscrições — encontra o conflito só na segunda página', async () => {
      const subscriptionsList = vi.fn()
        .mockResolvedValueOnce({
          data: [{ id: 'sub_pagina_1', status: 'active', items: { data: [{ price: { id: STARTER_PRICE_ID } }] } }],
          has_more: true,
        })
        .mockResolvedValueOnce({
          data: [{ id: 'sub_pagina_2', status: 'past_due', items: { data: [{ price: { id: PRO_PRICE_ID } }] } }],
          has_more: false,
        })
      const sessionsCreate = vi.fn()
      mockStripe({ sessionsCreate, subscriptionsList })
      const flag = mockConflicts()
      mockProfessional({ id: 'prof-1', email: 'prof@example.com', plan: null, stripe_customer_id: 'cus_1', stripe_subscription_id: null })

      const { POST } = await import('./route')
      const res = await POST(fakeRequest({ professional_id: 'prof-1', plan: 'starter' }))

      expect(res.status).toBe(409)
      expect(subscriptionsList).toHaveBeenCalledTimes(2)
      expect(subscriptionsList.mock.calls[1][0]).toEqual(expect.objectContaining({ starting_after: 'sub_pagina_1' }))
      expect(sessionsCreate).not.toHaveBeenCalled()
      expect(flag).toHaveBeenCalledWith(expect.objectContaining({ newSubscriptionId: 'sub_pagina_1,sub_pagina_2' }))
    })

    it('erro ao criar a sessão no Stripe (nunca chegou a ser criada): liberta a reserva antes de devolver o erro', async () => {
      const release = vi.fn().mockResolvedValue(undefined)
      mockCheckoutLock({ release })
      const sessionsCreate = vi.fn().mockRejectedValue(new Error('Stripe indisponível'))
      mockStripe({ sessionsCreate })
      mockProfessional({ id: 'prof-1', email: 'prof@example.com', plan: null, stripe_customer_id: null, stripe_subscription_id: null })

      const { POST } = await import('./route')
      const res = await POST(fakeRequest({ professional_id: 'prof-1', plan: 'starter' }))

      expect(res.status).toBe(500)
      expect(release).toHaveBeenCalledWith('prof-1', 'idem-test-key')
    })

    // Requisito 1 e requisito 10 ("Stripe cria sessão e a gravação local
    // falha"): o cenário mais perigoso — o Stripe JÁ criou a sessão real,
    // mas escrever isso na reserva falhou. Nunca pode libertar a reserva
    // aqui, porque isso permitiria uma chave NOVA na próxima tentativa,
    // criando uma segunda sessão real.
    it('Stripe cria a sessão com sucesso mas attachCheckoutSession falha: NÃO liberta a reserva, para a próxima tentativa retomar com a MESMA chave', async () => {
      const release = vi.fn().mockResolvedValue(undefined)
      const attach = vi.fn().mockRejectedValue(new Error('timeout na escrita'))
      mockCheckoutLock({ release, attach })
      const sessionsCreate = vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/criada-mas-nao-gravada', id: 'cs_perdida' })
      mockStripe({ sessionsCreate })
      mockProfessional({ id: 'prof-1', email: 'prof@example.com', plan: null, stripe_customer_id: null, stripe_subscription_id: null })

      const { POST } = await import('./route')
      const res = await POST(fakeRequest({ professional_id: 'prof-1', plan: 'starter' }))

      expect(res.status).toBe(500)
      expect(sessionsCreate).toHaveBeenCalledTimes(1) // a sessão foi mesmo criada no Stripe
      expect(release).not.toHaveBeenCalled() // nunca liberta depois disto
    })

    it('sucesso a criar sessão nova: associa o id da sessão à reserva pela mesma idempotencyKey, mas NUNCA a liberta (só o webhook decide quando)', async () => {
      const release = vi.fn().mockResolvedValue(undefined)
      const attach = vi.fn().mockResolvedValue(undefined)
      mockCheckoutLock({ release, attach })
      const sessionsCreate = vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/nova', id: 'cs_nova' })
      mockStripe({ sessionsCreate })
      mockProfessional({ id: 'prof-1', email: 'prof@example.com', plan: null, stripe_customer_id: null, stripe_subscription_id: null })

      const { POST } = await import('./route')
      await POST(fakeRequest({ professional_id: 'prof-1', plan: 'starter' }))

      expect(attach).toHaveBeenCalledWith('prof-1', 'idem-test-key', 'cs_nova')
      expect(release).not.toHaveBeenCalled()
    })

    it('upgrade com subscrição existente: liberta sempre a reserva no fim, mesmo quando a chamada ao Stripe falha', async () => {
      const release = vi.fn().mockResolvedValue(undefined)
      mockCheckoutLock({ release })
      const retrieve = vi.fn().mockResolvedValue({ items: { data: [{ id: 'si_1' }] }, schedule: null })
      const update = vi.fn().mockRejectedValue(new Error('Your card was declined.'))
      mockStripe({ retrieve, update })
      mockProfessional({ id: 'prof-1', email: 'prof@example.com', plan: 'starter', stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_1' })

      const { POST } = await import('./route')
      const res = await POST(fakeRequest({ professional_id: 'prof-1', plan: 'pro' }))

      expect(res.status).toBe(402)
      expect(release).toHaveBeenCalledWith('prof-1', 'idem-test-key')
    })
  })
})
