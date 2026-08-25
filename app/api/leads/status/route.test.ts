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

describe('POST /api/leads/status', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => {
    vi.restoreAllMocks()
    vi.doUnmock('@/lib/supabase-server')
    vi.doUnmock('@/lib/supabase-admin')
    vi.doUnmock('@/lib/email')
  })

  it('bloqueia quem não está autenticado, sem tocar na base de dados', async () => {
    mockAuth(null)
    const from = vi.fn()
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))
    vi.doMock('@/lib/email', () => ({ emailPedidoDepoimento: vi.fn() }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1', status: 'proposta' }))

    expect(res.status).toBe(401)
    expect(from).not.toHaveBeenCalled()
  })

  it('lead de outro profissional: 404, nunca chega a atualizar nem a enviar email', async () => {
    mockAuth('user-1')
    const update = vi.fn()
    const emailPedidoDepoimento = vi.fn()
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'professionals') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1' } }) }) }) }
          if (table === 'leads') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'lead-1', professional_id: 'outro-prof', opened_at: null, source: 'pessoal', locked: false } }) }) }), update }
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))
    vi.doMock('@/lib/email', () => ({ emailPedidoDepoimento }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1', status: 'fechado' }))
    const json = await res.json()

    expect(res.status).toBe(404)
    expect(json.reason).toBe('not_found')
    expect(update).not.toHaveBeenCalled()
    expect(emailPedidoDepoimento).not.toHaveBeenCalled()
  })

  it('lead próprio mas ainda bloqueado (não autorizado): 403, nunca atualiza nem revela dados', async () => {
    mockAuth('user-1')
    const update = vi.fn()
    const emailPedidoDepoimento = vi.fn()
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'professionals') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1' } }) }) }) }
          // lead do link pessoal, opened_at ainda null -> não autorizado
          if (table === 'leads') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'lead-1', professional_id: 'prof-1', opened_at: null, source: 'pessoal', locked: false } }) }) }), update }
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))
    vi.doMock('@/lib/email', () => ({ emailPedidoDepoimento }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1', status: 'fechado' }))
    const json = await res.json()

    expect(res.status).toBe(403)
    expect(json.reason).toBe('locked')
    expect(update).not.toHaveBeenCalled()
    expect(emailPedidoDepoimento).not.toHaveBeenCalled()
  })

  it('lead próprio, marketplace ainda não adquirido (locked=true): 403, nunca atualiza', async () => {
    mockAuth('user-1')
    const update = vi.fn()
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'professionals') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1' } }) }) }) }
          if (table === 'leads') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'lead-1', professional_id: 'prof-1', opened_at: null, source: 'marketplace', locked: true } }) }) }), update }
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))
    vi.doMock('@/lib/email', () => ({ emailPedidoDepoimento: vi.fn() }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1', status: 'proposta' }))

    expect(res.status).toBe(403)
    expect(update).not.toHaveBeenCalled()
  })

  it('lead próprio e autorizado: atualiza o status, filtrado também por professional_id', async () => {
    mockAuth('user-1')
    let updateArgs: Record<string, unknown> | null = null
    const eqCalls: unknown[] = []
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'professionals') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1' } }) }) }) }
          if (table === 'leads') {
            return {
              select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'lead-1', professional_id: 'prof-1', opened_at: '2026-07-17T00:00:00Z', source: 'pessoal', locked: false } }) }) }),
              update: (payload: Record<string, unknown>) => {
                updateArgs = payload
                return { eq: (...a: unknown[]) => { eqCalls.push(a); return { eq: (...b: unknown[]) => { eqCalls.push(b); return Promise.resolve({ error: null }) } } } }
              },
            }
          }
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))
    vi.doMock('@/lib/email', () => ({ emailPedidoDepoimento: vi.fn() }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1', status: 'proposta' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.ok).toBe(true)
    expect(updateArgs).toEqual({ status: 'proposta' })
    expect(eqCalls).toContainEqual(['id', 'lead-1'])
    expect(eqCalls).toContainEqual(['professional_id', 'prof-1'])
  })

  it('lead próprio e autorizado, status "fechado": envia email de depoimento com o nome real do cliente', async () => {
    mockAuth('user-1')
    const emailPedidoDepoimento = vi.fn().mockResolvedValue(undefined)
    let leadsSelectCallCount = 0
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'professionals') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1' } }) }) }) }
          if (table === 'leads') {
            return {
              select: () => {
                leadsSelectCallCount += 1
                if (leadsSelectCallCount === 1) {
                  return { eq: () => ({ maybeSingle: async () => ({ data: { id: 'lead-1', professional_id: 'prof-1', opened_at: '2026-07-17T00:00:00Z', source: 'pessoal', locked: false } }) }) }
                }
                return { eq: () => ({ single: async () => ({ data: { name: 'Cliente Real', email: 'cliente@example.com', professionals: { name: 'Profissional Real', email: 'prof@example.com' } } }) }) }
              },
              update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
            }
          }
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))
    vi.doMock('@/lib/email', () => ({ emailPedidoDepoimento }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1', status: 'fechado' }))

    expect(res.status).toBe(200)
    expect(emailPedidoDepoimento).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'profissional', outroNome: 'Cliente Real' }))
    expect(emailPedidoDepoimento).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'cliente', name: 'Cliente Real', email: 'cliente@example.com' }))
  })
})
