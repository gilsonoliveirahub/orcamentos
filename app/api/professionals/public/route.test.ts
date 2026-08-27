import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('GET /api/professionals/public', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => { vi.restoreAllMocks(); vi.doUnmock('@/lib/supabase-admin') })

  it('devolve só os campos públicos, nunca dados sensíveis (phone/email/stripe/créditos/subscrição)', async () => {
    let selectedColumns = ''
    let filteredActive: unknown
    const row = {
      id: 'prof-1', name: 'Ana Pintora', slug: 'ana-pintora-123', specialty: 'Pintura',
      specialties: ['Pintura'], zone: 'Lisboa', description: 'Pinto tudo', bio: null,
      avatar_url: null, plan: 'pro', created_at: '2026-01-01T00:00:00Z', accepting_leads: true,
      reviews: [{ rating: 5 }], professional_portfolio: [],
    }
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: () => ({
          select: (cols: string) => {
            selectedColumns = cols
            return { eq: (_field: string, value: unknown) => { filteredActive = value; return Promise.resolve({ data: [row], error: null }) } }
          },
        }),
      },
    }))

    const { GET } = await import('./route')
    const res = await GET()
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(filteredActive).toBe(true)
    expect(json.professionals).toEqual([row])

    // A lista de colunas pedida ao Supabase nunca pode incluir campos
    // sensíveis — é esta lista, não o que o componente depois renderiza,
    // que decide o que sai da base de dados para o browser.
    const sensitiveFields = [
      'phone', 'email', 'user_id', 'stripe_customer_id', 'stripe_subscription_id',
      'marketplace_credits', 'current_period_start', 'current_period_end',
      'pending_plan', 'marketing_opt_in', 'trial_ends_at', 'price_m2', 'min_quote',
    ]
    for (const field of sensitiveFields) {
      expect(selectedColumns).not.toContain(field)
    }
    expect(selectedColumns).not.toBe('*')
  })

  it('erro do Supabase: devolve 500 em vez de rebentar', async () => {
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: { from: () => ({ select: () => ({ eq: async () => ({ data: null, error: { message: 'falha' } }) }) }) },
    }))

    const { GET } = await import('./route')
    const res = await GET()
    expect(res.status).toBe(500)
  })

  it('sem profissionais ativos: devolve lista vazia, sem erro', async () => {
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: { from: () => ({ select: () => ({ eq: async () => ({ data: [], error: null }) }) }) },
    }))

    const { GET } = await import('./route')
    const res = await GET()
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.professionals).toEqual([])
  })
})
