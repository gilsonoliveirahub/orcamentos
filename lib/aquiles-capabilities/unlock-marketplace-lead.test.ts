import { afterEach, describe, expect, it, vi } from 'vitest'

async function loadCapability(opts: {
  fromImpl: (table: string) => unknown
  rpcImpl: (...args: unknown[]) => Promise<{ data: unknown }>
  emailLeadDesbloqueado?: ReturnType<typeof vi.fn>
}) {
  vi.resetModules()
  vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: vi.fn(opts.fromImpl), rpc: vi.fn(opts.rpcImpl) } }))
  vi.doMock('@/lib/email', () => ({ emailLeadDesbloqueado: opts.emailLeadDesbloqueado ?? vi.fn(async () => {}) }))
  const mod = await import('./unlock-marketplace-lead')
  return mod.unlockMarketplaceLeadCapability
}

describe('unlock-marketplace-lead capability', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.doUnmock('@/lib/supabase-admin')
    vi.doUnmock('@/lib/email')
  })

  it('preview: profissional sem créditos e lead ainda bloqueado fica blocked', async () => {
    const capability = await loadCapability({
      fromImpl: (table: string) => {
        if (table === 'leads') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'l1', name: 'Cliente', phone: '9', locked: true, professional_id: 'p1', source: 'marketplace' } }) }) }) }
        if (table === 'professionals') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'p1', name: 'Prof', marketplace_credits: 0 } }) }) }) }
        throw new Error('tabela inesperada')
      },
      rpcImpl: async () => ({ data: null }),
    })
    const preview = await capability.preview({ lead_id: 'l1', professional_id: 'p1' })
    expect(preview.blocked).toBe(true)
    expect(preview.blocked_reason).toMatch(/créditos/)
  })

  it('preview: lead já desbloqueado não gasta crédito nem bloqueia', async () => {
    const capability = await loadCapability({
      fromImpl: (table: string) => {
        if (table === 'leads') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'l1', name: 'Cliente', phone: '9', locked: false, professional_id: 'p1', source: 'marketplace' } }) }) }) }
        if (table === 'professionals') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'p1', name: 'Prof', marketplace_credits: 3 } }) }) }) }
        throw new Error('tabela inesperada')
      },
      rpcImpl: async () => ({ data: null }),
    })
    const preview = await capability.preview({ lead_id: 'l1', professional_id: 'p1' })
    expect(preview.blocked).toBe(false)
    expect(preview.changes).toEqual([])
    expect(preview.effects[0].label).toMatch(/Já estava desbloqueado/)
  })

  it('preview: lead de outro profissional fica bloqueado', async () => {
    const capability = await loadCapability({
      fromImpl: (table: string) => {
        if (table === 'leads') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'l1', name: 'Cliente', phone: '9', locked: true, professional_id: 'OUTRO', source: 'marketplace' } }) }) }) }
        if (table === 'professionals') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'p1', name: 'Prof', marketplace_credits: 3 } }) }) }) }
        throw new Error('tabela inesperada')
      },
      rpcImpl: async () => ({ data: null }),
    })
    const preview = await capability.preview({ lead_id: 'l1', professional_id: 'p1' })
    expect(preview.blocked).toBe(true)
    expect(preview.blocked_reason).toMatch(/não está atribuído/)
  })

  it('execute: chama a RPC atómica com os IDs exatos e envia email de confirmação', async () => {
    const emailLeadDesbloqueado = vi.fn(async () => {})
    const rpcImpl = vi.fn(async () => ({ data: { ok: true, already_unlocked: false } }))
    const capability = await loadCapability({
      fromImpl: (table: string) => {
        if (table === 'leads') return { select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'l1', name: 'Cliente', phone: '9', email: 'c@x.com' } }) }) }) }
        if (table === 'professionals') return { select: () => ({ eq: () => ({ single: async () => ({ data: { name: 'Prof', email: 'p@x.com' } }) }) }) }
        throw new Error('tabela inesperada')
      },
      rpcImpl,
      emailLeadDesbloqueado,
    })

    const result = await capability.execute({ lead_id: 'l1', professional_id: 'p1' }, { actionId: 'a1', approvedByAdminId: 'admin-1' })

    expect(rpcImpl).toHaveBeenCalledWith('unlock_marketplace_lead_by_credit', { p_lead_id: 'l1', p_professional_id: 'p1' })
    expect(result).toEqual({ already_unlocked: false })
    await vi.waitFor(() => expect(emailLeadDesbloqueado).toHaveBeenCalled())
  })

  it('execute: sem créditos rejeita com mensagem clara e nunca chega a enviar email', async () => {
    const emailLeadDesbloqueado = vi.fn(async () => {})
    const capability = await loadCapability({
      fromImpl: () => { throw new Error('não deveria consultar leads/professionals quando a RPC já recusou') },
      rpcImpl: async () => ({ data: { ok: false, error: 'credits' } }),
      emailLeadDesbloqueado,
    })

    await expect(capability.execute({ lead_id: 'l1', professional_id: 'p1' }, { actionId: 'a1', approvedByAdminId: 'admin-1' })).rejects.toThrow(/créditos/)
    expect(emailLeadDesbloqueado).not.toHaveBeenCalled()
  })
})
