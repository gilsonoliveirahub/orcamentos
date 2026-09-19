import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const ORIGINAL_ENV = { ...process.env }
const STARTER_MONTHLY = 'price_1TPAO4LFTn4mze6d70qkDWAj'
const PRO_MONTHLY = 'price_1TPAOELFTn4mze6dDaYx6snk'
const STARTER_ANNUAL = 'price_1UHAsXLFTn4mze6dU5uk5YkJ'
const PRO_ANNUAL = 'price_1UHAuTLFTn4mze6d29nsPNiC'

function mockAuth(userId: string | null) {
  vi.doMock('@/lib/supabase-server', () => ({
    createClient: async () => ({
      auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null } }) },
    }),
  }))
}

function mockStripe(retrieve: ReturnType<typeof vi.fn>) {
  vi.doMock('stripe', () => ({
    __esModule: true,
    default: vi.fn().mockImplementation(function StripeMock(this: unknown) {
      Object.assign(this as object, { subscriptions: { retrieve } })
    }),
  }))
}

// Guarda por profissional, indexado por user_id — simula a tabela real:
// cada linha só é devolvida a quem se autenticar com o user_id certo,
// nunca por um id à escolha do pedido (a rota já nem lê o corpo do pedido).
// adminUserIds simula a tabela `admins` (2026-09-19) — quem lá está tem
// acesso administrativo, nunca inferido de nenhum campo em `professionals`.
function mockProfessionalsByUser(byUserId: Record<string, unknown>, adminUserIds: string[] = []) {
  const professionalsEq = vi.fn((_col: string, value: string) => ({
    maybeSingle: async () => ({ data: byUserId[value] ?? null }),
  }))
  const adminsEq = vi.fn((_col: string, value: string) => ({
    maybeSingle: async () => ({ data: adminUserIds.includes(value) ? { id: `admin-${value}` } : null }),
  }))
  const from = vi.fn((table: string) => {
    if (table === 'professionals') return { select: () => ({ eq: professionalsEq }) }
    if (table === 'admins') return { select: () => ({ eq: adminsEq }) }
    throw new Error(`tabela inesperada: ${table}`)
  })
  vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))
  return professionalsEq
}

// Regressão do bug real (2026-09-19): app/upgrade decidia "Plano atual" só
// pelo tier guardado em professionals.plan, ignorando o ciclo. Esta rota é
// a fonte de verdade nova — lê sempre o Price ID real da subscrição no
// Stripe (nunca confia no tier da BD para o ciclo) e resolve SEMPRE o
// profissional a partir da sessão autenticada (nunca de um id enviado pelo
// browser), para nenhum profissional conseguir consultar a subscrição de
// outro.
describe('GET /api/stripe/subscription-status', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env = { ...ORIGINAL_ENV, STRIPE_SECRET_KEY: 'sk_test_fake', STRIPE_PRICE_STARTER_ANNUAL: STARTER_ANNUAL, STRIPE_PRICE_PRO_ANNUAL: PRO_ANNUAL }
  })
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.restoreAllMocks()
    vi.doUnmock('@/lib/supabase-admin')
    vi.doUnmock('@/lib/supabase-server')
    vi.doUnmock('stripe')
  })

  it('sem sessão autenticada: 401, nunca chega a tocar na base de dados nem no Stripe', async () => {
    mockAuth(null)
    const from = vi.fn()
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))
    const retrieve = vi.fn()
    mockStripe(retrieve)

    const { GET } = await import('./route')
    const res = await GET()

    expect(res.status).toBe(401)
    expect(from).not.toHaveBeenCalled()
    expect(retrieve).not.toHaveBeenCalled()
  })

  it('sessão autenticada mas sem linha professionals correspondente: 403, nunca 500', async () => {
    mockAuth('user-sem-profissional')
    mockProfessionalsByUser({})
    mockStripe(vi.fn())

    const { GET } = await import('./route')
    const res = await GET()

    expect(res.status).toBe(403)
  })

  it('isolamento entre utilizadores: resolve sempre pelo user_id da sessão — a conta de outro profissional nunca é devolvida', async () => {
    const eqSpy = mockProfessionalsByUser({
      'user-a': { plan: 'starter', stripe_subscription_id: null },
      'user-b': { plan: 'pro', stripe_subscription_id: 'sub_do_b' },
    })
    mockAuth('user-a')
    mockStripe(vi.fn())

    const { GET } = await import('./route')
    const json = await (await GET()).json()

    // A única identidade usada para consultar a BD é a da sessão — nunca
    // haveria forma de o pedido pedir os dados do user-b.
    expect(eqSpy).toHaveBeenCalledWith('user_id', 'user-a')
    expect(json.plan).toBe('starter')
    expect(json).not.toEqual(expect.objectContaining({ plan: 'pro' }))
  })

  it('Pro mensal: classifica o Price ID real como {plan: pro, cycle: monthly}', async () => {
    mockAuth('user-1')
    mockProfessionalsByUser({ 'user-1': { plan: 'pro', stripe_subscription_id: 'sub_1' } })
    mockStripe(vi.fn().mockResolvedValue({
      status: 'active',
      items: { data: [{ price: { id: PRO_MONTHLY }, current_period_end: 1893456000 }] },
    }))
    const { GET } = await import('./route')
    const json = await (await GET()).json()
    expect(json).toEqual({ plan: 'pro', cycle: 'monthly', status: 'active', current_period_end: new Date(1893456000 * 1000).toISOString() })
  })

  it('Pro anual: classifica o Price ID real como {plan: pro, cycle: annual}', async () => {
    mockAuth('user-1')
    mockProfessionalsByUser({ 'user-1': { plan: 'pro', stripe_subscription_id: 'sub_2' } })
    mockStripe(vi.fn().mockResolvedValue({
      status: 'active',
      items: { data: [{ price: { id: PRO_ANNUAL }, current_period_end: 1893456000 }] },
    }))
    const { GET } = await import('./route')
    const json = await (await GET()).json()
    expect(json.plan).toBe('pro')
    expect(json.cycle).toBe('annual')
  })

  it('Starter mensal e Starter anual também são classificados corretamente (regra 4 — mesma lógica do Pro)', async () => {
    mockAuth('user-1')
    mockProfessionalsByUser({ 'user-1': { plan: 'starter', stripe_subscription_id: 'sub_3' } })
    mockStripe(vi.fn().mockResolvedValue({
      status: 'active',
      items: { data: [{ price: { id: STARTER_ANNUAL }, current_period_end: null }] },
    }))
    const { GET } = await import('./route')
    const json = await (await GET()).json()
    expect(json).toEqual({ plan: 'starter', cycle: 'annual', status: 'active', current_period_end: null })
  })

  it('sem stripe_subscription_id, profissional normal (não admin): devolve cycle null e status no_subscription, nunca inventa o ciclo a partir do tier "pro" — tratado como estado inconsistente', async () => {
    mockAuth('user-1')
    mockProfessionalsByUser({ 'user-1': { plan: 'pro', stripe_subscription_id: null } })
    mockStripe(vi.fn())
    const { GET } = await import('./route')
    const json = await (await GET()).json()
    expect(json).toEqual({ plan: 'pro', cycle: null, status: 'no_subscription', current_period_end: null })
  })

  it('stripe_subscription_id guardado mas já não existe/inacessível no Stripe (profissional normal): cai no mesmo estado seguro (cycle null, no_subscription), sempre 200, nunca 500', async () => {
    mockAuth('user-1')
    mockProfessionalsByUser({ 'user-1': { plan: 'pro', stripe_subscription_id: 'sub_apagada' } })
    mockStripe(vi.fn().mockRejectedValue(new Error('No such subscription')))
    const { GET } = await import('./route')
    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ plan: 'pro', cycle: null, status: 'no_subscription', current_period_end: null })
  })

  // Acesso administrativo (2026-09-19, pedido pelo Gilson depois de
  // confirmar que a sua conta real é admin e tem plan:'pro' sem
  // subscrição): a mesma situação acima, mas com o user_id também presente
  // na tabela `admins`, tem de dar um estado DIFERENTE — nunca "erro de
  // cobrança" para um acesso concedido de propósito.
  it('sem stripe_subscription_id, conta de administrador com tier pago: devolve status admin_access, nunca no_subscription nem um ciclo inventado', async () => {
    mockAuth('user-admin')
    mockProfessionalsByUser({ 'user-admin': { plan: 'pro', stripe_subscription_id: null } }, ['user-admin'])
    mockStripe(vi.fn())
    const { GET } = await import('./route')
    const json = await (await GET()).json()
    expect(json).toEqual({ plan: 'pro', cycle: null, status: 'admin_access', current_period_end: null })
  })

  it('admin com plano Starter (não só Pro) e sem subscrição: também admin_access — mesma lógica para os dois tiers', async () => {
    mockAuth('user-admin')
    mockProfessionalsByUser({ 'user-admin': { plan: 'starter', stripe_subscription_id: null } }, ['user-admin'])
    mockStripe(vi.fn())
    const { GET } = await import('./route')
    const json = await (await GET()).json()
    expect(json.status).toBe('admin_access')
  })

  it('admin cujo stripe_subscription_id guardado já não é acessível no Stripe: também cai em admin_access, não em no_subscription', async () => {
    mockAuth('user-admin')
    mockProfessionalsByUser({ 'user-admin': { plan: 'pro', stripe_subscription_id: 'sub_apagada' } }, ['user-admin'])
    mockStripe(vi.fn().mockRejectedValue(new Error('No such subscription')))
    const { GET } = await import('./route')
    const json = await (await GET()).json()
    expect(json.status).toBe('admin_access')
  })

  it('admin sem nenhum tier pago (plan null): fica no_subscription — acesso administrativo nunca aparece sem um plano real por trás', async () => {
    mockAuth('user-admin')
    mockProfessionalsByUser({ 'user-admin': { plan: null, stripe_subscription_id: null } }, ['user-admin'])
    mockStripe(vi.fn())
    const { GET } = await import('./route')
    const json = await (await GET()).json()
    expect(json.status).toBe('no_subscription')
  })

  it('admin COM subscrição Stripe real ativa: usa essa subscrição normalmente, nunca mostra admin_access quando há billing real', async () => {
    mockAuth('user-admin')
    mockProfessionalsByUser({ 'user-admin': { plan: 'pro', stripe_subscription_id: 'sub_real' } }, ['user-admin'])
    mockStripe(vi.fn().mockResolvedValue({
      status: 'active',
      items: { data: [{ price: { id: PRO_MONTHLY }, current_period_end: 1893456000 }] },
    }))
    const { GET } = await import('./route')
    const json = await (await GET()).json()
    expect(json).toEqual({ plan: 'pro', cycle: 'monthly', status: 'active', current_period_end: new Date(1893456000 * 1000).toISOString() })
  })

  it('indisponibilidade do Stripe (timeout/rede): mesmo tratamento seguro, nunca 500 nem bloqueia a página', async () => {
    mockAuth('user-1')
    mockProfessionalsByUser({ 'user-1': { plan: 'starter', stripe_subscription_id: 'sub_5' } })
    mockStripe(vi.fn().mockRejectedValue(new Error('ETIMEDOUT')))
    const { GET } = await import('./route')
    const res = await GET()
    expect(res.status).toBe(200)
  })

  it('subscrição com status past_due: reflete isso no estado simplificado', async () => {
    mockAuth('user-1')
    mockProfessionalsByUser({ 'user-1': { plan: 'starter', stripe_subscription_id: 'sub_4' } })
    mockStripe(vi.fn().mockResolvedValue({
      status: 'past_due',
      items: { data: [{ price: { id: STARTER_MONTHLY }, current_period_end: null }] },
    }))
    const { GET } = await import('./route')
    const json = await (await GET()).json()
    expect(json.status).toBe('past_due')
  })

  it('nunca expõe stripe_subscription_id, stripe_customer_id nem o Price ID em bruto na resposta', async () => {
    mockAuth('user-1')
    mockProfessionalsByUser({ 'user-1': { plan: 'pro', stripe_subscription_id: 'sub_1', stripe_customer_id: 'cus_1' } })
    mockStripe(vi.fn().mockResolvedValue({
      status: 'active',
      items: { data: [{ price: { id: PRO_MONTHLY }, current_period_end: 1893456000 }] },
    }))
    const { GET } = await import('./route')
    const json = await (await GET()).json()
    expect(Object.keys(json).sort()).toEqual(['current_period_end', 'cycle', 'plan', 'status'])
    expect(JSON.stringify(json)).not.toContain('sub_1')
    expect(JSON.stringify(json)).not.toContain('cus_1')
    expect(JSON.stringify(json)).not.toContain(PRO_MONTHLY)
  })
})
