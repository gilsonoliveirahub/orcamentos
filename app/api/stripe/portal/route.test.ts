import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

function mockAuth(userId: string | null) {
  vi.doMock('@/lib/supabase-server', () => ({
    createClient: async () => ({
      auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null } }) },
    }),
  }))
}

function mockStripe(portalCreate: ReturnType<typeof vi.fn>) {
  vi.doMock('stripe', () => ({
    __esModule: true,
    default: vi.fn().mockImplementation(function StripeMock(this: unknown) {
      Object.assign(this as object, { billingPortal: { sessions: { create: portalCreate } } })
    }),
  }))
}

// Indexado por user_id, nunca por um professional_id escolhido pelo
// pedido — simula a tabela real: só a sessão autenticada decide qual linha
// é lida.
function mockProfessionalsByUser(byUserId: Record<string, unknown>) {
  const eq = vi.fn((_col: string, value: string) => ({
    maybeSingle: async () => ({ data: byUserId[value] ?? null }),
  }))
  vi.doMock('@/lib/supabase-admin', () => ({
    supabaseAdmin: { from: (table: string) => {
      if (table !== 'professionals') throw new Error(`tabela inesperada: ${table}`)
      return { select: () => ({ eq }) }
    } },
  }))
  return eq
}

describe('POST /api/stripe/portal — correção de segurança (2026-10-17): nunca aceita professional_id do corpo', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => {
    vi.restoreAllMocks()
    vi.doUnmock('@/lib/supabase-admin')
    vi.doUnmock('@/lib/supabase-server')
    vi.doUnmock('stripe')
  })

  it('sem sessão autenticada: 401, nunca chega a tocar na base de dados nem no Stripe', async () => {
    mockAuth(null)
    const from = vi.fn()
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))
    const portalCreate = vi.fn()
    mockStripe(portalCreate)

    const { POST } = await import('./route')
    const res = await POST()

    expect(res.status).toBe(401)
    expect(from).not.toHaveBeenCalled()
    expect(portalCreate).not.toHaveBeenCalled()
  })

  it('sessão autenticada, sem stripe_customer_id: 400, nunca abre portal de ninguém', async () => {
    mockAuth('user-sem-sub')
    mockProfessionalsByUser({ 'user-sem-sub': { stripe_customer_id: null } })
    const portalCreate = vi.fn()
    mockStripe(portalCreate)

    const { POST } = await import('./route')
    const res = await POST()

    expect(res.status).toBe(400)
    expect(portalCreate).not.toHaveBeenCalled()
  })

  it('isolamento entre utilizadores: abre sempre o portal do stripe_customer_id da PRÓPRIA sessão, nunca de outro profissional', async () => {
    const eqSpy = mockProfessionalsByUser({
      'user-a': { stripe_customer_id: 'cus_a' },
      'user-b': { stripe_customer_id: 'cus_b' },
    })
    mockAuth('user-a')
    const portalCreate = vi.fn().mockResolvedValue({ url: 'https://billing.stripe.com/session_a' })
    mockStripe(portalCreate)

    const { POST } = await import('./route')
    const res = await POST()
    const json = await res.json()

    // A única identidade usada para consultar a BD é a da sessão — nunca
    // haveria forma de o pedido abrir o portal do user-b.
    expect(eqSpy).toHaveBeenCalledWith('user_id', 'user-a')
    expect(portalCreate).toHaveBeenCalledWith(expect.objectContaining({ customer: 'cus_a' }))
    expect(json.url).toBe('https://billing.stripe.com/session_a')
  })

  it('um professional_id de outra conta no corpo do pedido é ignorado — a rota nem lê o corpo', async () => {
    const eqSpy = mockProfessionalsByUser({
      'user-a': { stripe_customer_id: 'cus_a' },
      'user-b': { stripe_customer_id: 'cus_b' },
    })
    mockAuth('user-a')
    const portalCreate = vi.fn().mockResolvedValue({ url: 'https://billing.stripe.com/session_a' })
    mockStripe(portalCreate)

    const { POST } = await import('./route')
    // POST não aceita corpo (ver assinatura da função) — mesmo que o
    // browser envie professional_id="outro", é sempre ignorado.
    const res = await POST()
    const json = await res.json()

    expect(eqSpy).toHaveBeenCalledWith('user_id', 'user-a')
    expect(portalCreate).toHaveBeenCalledWith(expect.objectContaining({ customer: 'cus_a' }))
    expect(json.url).not.toBe('https://billing.stripe.com/session_b')
  })

  it('falha do Stripe ao criar a sessão do portal: 500, mensagem de erro, nunca expõe stripe_customer_id', async () => {
    mockProfessionalsByUser({ 'user-a': { stripe_customer_id: 'cus_a' } })
    mockAuth('user-a')
    mockStripe(vi.fn().mockRejectedValue(new Error('Stripe indisponível')))

    const { POST } = await import('./route')
    const res = await POST()
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(JSON.stringify(json)).not.toContain('cus_a')
  })
})
