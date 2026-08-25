import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

const ORIGINAL_ENV = { ...process.env }
const STARTER_PRICE_ID = 'price_1TPAO4LFTn4mze6d70qkDWAj'
const PRO_PRICE_ID = 'price_1TPAOELFTn4mze6dDaYx6snk'

function fakeRequest(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest
}

function mockStripe({
  retrieve, update, sessionsCreate,
  scheduleCreate, scheduleRetrieve, scheduleUpdate, scheduleRelease,
}: {
  retrieve?: ReturnType<typeof vi.fn>; update?: ReturnType<typeof vi.fn>; sessionsCreate?: ReturnType<typeof vi.fn>
  scheduleCreate?: ReturnType<typeof vi.fn>; scheduleRetrieve?: ReturnType<typeof vi.fn>; scheduleUpdate?: ReturnType<typeof vi.fn>; scheduleRelease?: ReturnType<typeof vi.fn>
}) {
  vi.doMock('stripe', () => ({
    __esModule: true,
    default: vi.fn().mockImplementation(function StripeMock(this: unknown) {
      Object.assign(this as object, {
        subscriptions: { retrieve: retrieve ?? vi.fn(), update: update ?? vi.fn() },
        subscriptionSchedules: {
          create: scheduleCreate ?? vi.fn(),
          retrieve: scheduleRetrieve ?? vi.fn(),
          update: scheduleUpdate ?? vi.fn(),
          release: scheduleRelease ?? vi.fn(),
        },
        checkout: { sessions: { create: sessionsCreate ?? vi.fn() } },
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

describe('POST /api/stripe/checkout', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env = { ...ORIGINAL_ENV, STRIPE_SECRET_KEY: 'sk_test_fake' }
  })
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.restoreAllMocks()
    vi.doUnmock('@/lib/supabase-admin')
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
    expect(sessionsCreate).toHaveBeenCalledWith(expect.objectContaining({ customer_email: 'prof@example.com' }))
    expect(sessionsCreate.mock.calls[0][0]).not.toHaveProperty('customer')
  })

  it('reassinatura depois de um cancelamento (stripe_subscription_id limpo mas stripe_customer_id mantido): reutiliza o Customer existente, sem criar um duplicado', async () => {
    const retrieve = vi.fn()
    const update = vi.fn()
    const sessionsCreate = vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/session-2' })
    mockStripe({ retrieve, update, sessionsCreate })
    // Estado depois de customer.subscription.deleted: plan inactive,
    // stripe_subscription_id limpo, stripe_customer_id preservado.
    mockProfessional({ id: 'prof-1', email: 'prof@example.com', plan: 'inactive', stripe_customer_id: 'cus_1', stripe_subscription_id: null })

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ professional_id: 'prof-1', plan: 'starter' }))
    const json = await res.json()

    expect(json.url).toBe('https://checkout.stripe.com/session-2')
    // Nunca tenta atualizar uma subscrição já cancelada — vai direto para um novo Checkout.
    expect(retrieve).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
    // Reutiliza o customer existente (nunca customer_email, que criaria um segundo Customer no Stripe).
    expect(sessionsCreate).toHaveBeenCalledWith(expect.objectContaining({ customer: 'cus_1' }))
    expect(sessionsCreate.mock.calls[0][0]).not.toHaveProperty('customer_email')
  })

  it('já tem este plano ativo: recusa sem chamar o Stripe (evita subscrições/pedidos duplicados)', async () => {
    const retrieve = vi.fn()
    const update = vi.fn()
    mockStripe({ retrieve, update })
    mockProfessional({ id: 'prof-1', email: 'prof@example.com', plan: 'starter', stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_1' })

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ professional_id: 'prof-1', plan: 'starter' }))

    expect(res.status).toBe(400)
    expect(retrieve).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
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
    expect(sessionsCreate).not.toHaveBeenCalled() // nunca cria uma segunda subscrição
    expect(update).toHaveBeenCalledWith('sub_1', {
      items: [{ id: 'si_1', price: PRO_PRICE_ID }],
      proration_behavior: 'create_prorations',
      payment_behavior: 'error_if_incomplete',
    })
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
    expect(updatePayloads).toHaveLength(0) // plan continua 'starter' na BD, porque nunca foi tocado
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
      const update = vi.fn() // subscriptions.update — NUNCA deve ser chamado num downgrade
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
      expect(update).not.toHaveBeenCalled() // a subscrição corrente NUNCA é tocada diretamente
      expect(scheduleCreate).toHaveBeenCalledWith({ from_subscription: 'sub_1' })
      expect(scheduleUpdate).toHaveBeenCalledWith('sub_sched_1', {
        end_behavior: 'release',
        phases: [
          { items: [{ price: PRO_PRICE_ID }], start_date: 1755302400, end_date: 1757980800 }, // fase atual, preço Pro, até ao fim do ciclo JÁ PAGO
          { items: [{ price: STARTER_PRICE_ID }], start_date: 1757980800 },                    // a partir daí, preço Starter — é isto que o Stripe cobra na renovação (19€), nunca 39€ de novo
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

      // Nunca escreve plan diretamente — só pending_plan (indicação para a UI).
      // Isto é o que impede a BD e o Stripe de divergirem: quem manda no
      // valor real de "plan" é sempre a sincronização a partir do Stripe
      // (customer.subscription.updated / invoice.payment_succeeded), nunca
      // esta escrita otimista no momento do pedido.
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
})
