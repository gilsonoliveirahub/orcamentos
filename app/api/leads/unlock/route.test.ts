import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

function fakeRequest(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest
}

function mockAuth(userId: string | null) {
  vi.doMock('@/lib/supabase-server', () => ({
    createClient: async () => ({
      auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null } }) },
    }),
  }))
}

describe('POST /api/leads/unlock', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => {
    vi.restoreAllMocks()
    vi.doUnmock('@/lib/supabase-server')
    vi.doUnmock('@/lib/supabase-admin')
    vi.doUnmock('@/lib/email')
  })

  it('bloqueia quem não está autenticado, sem chamar a RPC', async () => {
    mockAuth(null)
    const rpc = vi.fn()
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: vi.fn(), rpc } }))
    vi.doMock('@/lib/email', () => ({ emailLeadDesbloqueado: vi.fn() }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1' }))

    expect(res.status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('RPC devolve not_found (lead inexistente ou de outro profissional): 404, sem enviar email', async () => {
    mockAuth('user-1')
    const emailLeadDesbloqueado = vi.fn()
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'professionals') return { select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'prof-1' } }) }) }) }
          throw new Error(`tabela inesperada: ${table}`)
        },
        rpc: async () => ({ data: { ok: false, error: 'not_found' } }),
      },
    }))
    vi.doMock('@/lib/email', () => ({ emailLeadDesbloqueado }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1' }))
    const json = await res.json()

    expect(res.status).toBe(404)
    expect(json.reason).toBe('not_found')
    expect(emailLeadDesbloqueado).not.toHaveBeenCalled()
  })

  it('RPC devolve credits (sem créditos suficientes): 402, sem enviar email', async () => {
    mockAuth('user-1')
    const emailLeadDesbloqueado = vi.fn()
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'professionals') return { select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'prof-1' } }) }) }) }
          throw new Error(`tabela inesperada: ${table}`)
        },
        rpc: async () => ({ data: { ok: false, error: 'credits' } }),
      },
    }))
    vi.doMock('@/lib/email', () => ({ emailLeadDesbloqueado }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1' }))
    const json = await res.json()

    expect(res.status).toBe(402)
    expect(json.reason).toBe('credits')
    expect(emailLeadDesbloqueado).not.toHaveBeenCalled()
  })

  it('RPC devolve ok: desbloqueia e envia email de confirmação com os dados do lead', async () => {
    mockAuth('user-1')
    const emailLeadDesbloqueado = vi.fn().mockResolvedValue(undefined)
    const rpcArgs: unknown[] = []
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'professionals') {
            return {
              select: (fields: string) => ({
                eq: () => ({
                  single: async () => (
                    fields === 'id' ? { data: { id: 'prof-1' } } : { data: { name: 'Prof Real', email: 'prof@example.com' } }
                  ),
                }),
              }),
            }
          }
          if (table === 'leads') {
            return { select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'lead-1', name: 'Cliente Real', phone: '351911111111', email: null } }) }) }) }
          }
          throw new Error(`tabela inesperada: ${table}`)
        },
        rpc: async (fn: string, args: unknown) => { rpcArgs.push([fn, args]); return { data: { ok: true, already_unlocked: false } } },
      },
    }))
    vi.doMock('@/lib/email', () => ({ emailLeadDesbloqueado }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.ok).toBe(true)
    expect(rpcArgs[0]).toEqual(['unlock_marketplace_lead_by_credit', { p_lead_id: 'lead-1', p_professional_id: 'prof-1' }])
    expect(emailLeadDesbloqueado).toHaveBeenCalledWith(expect.objectContaining({
      profName: 'Prof Real', leadName: 'Cliente Real', leadPhone: '351911111111',
    }))
  })

  it('concorrência: dois cliques simultâneos no mesmo lead — só um desconta crédito (simula o FOR UPDATE da função SQL)', async () => {
    mockAuth('user-1')
    vi.doMock('@/lib/email', () => ({ emailLeadDesbloqueado: vi.fn().mockResolvedValue(undefined) }))

    // Simula a transação atómica de unlock_marketplace_lead_by_credit: um
    // "await" artificial força as duas chamadas a chegarem ao ponto de
    // decisão antes de qualquer uma escrever, mas a leitura+escrita do
    // estado do lead (locked) em si corre sem mais nenhum yield — tal como
    // o FOR UPDATE serializa por baixo na transação real do Postgres.
    let credits = 3
    let locked = true
    const rpc = vi.fn(async () => {
      await Promise.resolve() // ponto de interleaving
      if (!locked) return { data: { ok: true, already_unlocked: true } }
      if (credits < 1) return { data: { ok: false, error: 'credits' } }
      credits -= 1
      locked = false
      return { data: { ok: true, already_unlocked: false } }
    })
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'professionals') return { select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'prof-1', name: 'Prof', email: 'prof@example.com' } }) }) }) }
          if (table === 'leads') return { select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'lead-1', name: 'Cliente', phone: '351900000000', email: null } }) }) }) }
          throw new Error(`tabela inesperada: ${table}`)
        },
        rpc,
      },
    }))

    const { POST } = await import('./route')
    const [resA, resB] = await Promise.all([
      POST(fakeRequest({ lead_id: 'lead-1' })),
      POST(fakeRequest({ lead_id: 'lead-1' })),
    ])
    const [jsonA, jsonB] = await Promise.all([resA.json(), resB.json()])

    expect(jsonA.ok).toBe(true)
    expect(jsonB.ok).toBe(true)
    // Uma das duas chamadas foi a "real" (already_unlocked:false), a outra idempotente (already_unlocked:true) — nunca as duas reais.
    expect(rpc.mock.results.length).toBe(2)
    expect(credits).toBe(2) // só descontou 1 crédito, nunca 2
  })
})
