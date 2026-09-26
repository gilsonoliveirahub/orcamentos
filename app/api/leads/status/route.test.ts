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
    vi.doUnmock('@/lib/complete-lead')
    vi.doUnmock('@/lib/lead-status-history')
  })

  it('bloqueia quem não está autenticado, sem tocar na base de dados', async () => {
    mockAuth(null)
    const from = vi.fn()
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))
    vi.doMock('@/lib/complete-lead', () => ({ sendReviewRequestEmail: vi.fn() }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1', status: 'proposta' }))

    expect(res.status).toBe(401)
    expect(from).not.toHaveBeenCalled()
  })

  it('lead de outro profissional: 404, nunca chega a atualizar nem a enviar email', async () => {
    mockAuth('user-1')
    const update = vi.fn()
    const sendReviewRequestEmail = vi.fn()
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'professionals') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1' } }) }) }) }
          if (table === 'leads') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'lead-1', professional_id: 'outro-prof', opened_at: null, source: 'pessoal', locked: false, concluido_at: null } }) }) }), update }
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))
    vi.doMock('@/lib/complete-lead', () => ({ sendReviewRequestEmail }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1', status: 'fechado' }))
    const json = await res.json()

    expect(res.status).toBe(404)
    expect(json.reason).toBe('not_found')
    expect(update).not.toHaveBeenCalled()
    expect(sendReviewRequestEmail).not.toHaveBeenCalled()
  })

  it('lead próprio mas ainda bloqueado (não autorizado): 403, nunca atualiza nem revela dados', async () => {
    mockAuth('user-1')
    const update = vi.fn()
    const sendReviewRequestEmail = vi.fn()
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'professionals') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1' } }) }) }) }
          // lead do link pessoal, opened_at ainda null -> não autorizado
          if (table === 'leads') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'lead-1', professional_id: 'prof-1', opened_at: null, source: 'pessoal', locked: false, concluido_at: null } }) }) }), update }
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))
    vi.doMock('@/lib/complete-lead', () => ({ sendReviewRequestEmail }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1', status: 'fechado' }))
    const json = await res.json()

    expect(res.status).toBe(403)
    expect(json.reason).toBe('locked')
    expect(update).not.toHaveBeenCalled()
    expect(sendReviewRequestEmail).not.toHaveBeenCalled()
  })

  it('lead próprio, marketplace ainda não adquirido (locked=true): 403, nunca atualiza', async () => {
    mockAuth('user-1')
    const update = vi.fn()
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'professionals') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1' } }) }) }) }
          if (table === 'leads') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'lead-1', professional_id: 'prof-1', opened_at: null, source: 'marketplace', locked: true, concluido_at: null } }) }) }), update }
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))
    vi.doMock('@/lib/complete-lead', () => ({ sendReviewRequestEmail: vi.fn() }))

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
              select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'lead-1', professional_id: 'prof-1', opened_at: '2026-07-17T00:00:00Z', source: 'pessoal', locked: false, concluido_at: null } }) }) }),
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
    vi.doMock('@/lib/complete-lead', () => ({ sendReviewRequestEmail: vi.fn() }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1', status: 'proposta' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.ok).toBe(true)
    expect(updateArgs).toEqual({ status: 'proposta' })
    expect(eqCalls).toContainEqual(['id', 'lead-1'])
    expect(eqCalls).toContainEqual(['professional_id', 'prof-1'])
  })

  it('fechado sem decisão sobre o valor final: 400, nunca atualiza', async () => {
    mockAuth('user-1')
    const update = vi.fn()
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'professionals') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1' } }) }) }) }
          if (table === 'leads') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'lead-1', professional_id: 'prof-1', opened_at: '2026-07-17T00:00:00Z', source: 'pessoal', locked: false, concluido_at: null } }) }) }), update }
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))
    vi.doMock('@/lib/complete-lead', () => ({ sendReviewRequestEmail: vi.fn() }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1', status: 'fechado' }))

    expect(res.status).toBe(400)
    expect(update).not.toHaveBeenCalled()
  })

  it('fechado com decisão "informado" mas valor inválido (0): 400, nunca atualiza', async () => {
    mockAuth('user-1')
    const update = vi.fn()
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'professionals') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1' } }) }) }) }
          if (table === 'leads') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'lead-1', professional_id: 'prof-1', opened_at: '2026-07-17T00:00:00Z', source: 'pessoal', locked: false, concluido_at: null } }) }) }), update }
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))
    vi.doMock('@/lib/complete-lead', () => ({ sendReviewRequestEmail: vi.fn() }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1', status: 'fechado', valor_fechado: 0, valor_fechado_decision: 'informado' }))

    expect(res.status).toBe(400)
    expect(update).not.toHaveBeenCalled()
  })

  it('fechado com decisão "informado" e valor válido: grava valor_fechado junto do status, sem enviar email', async () => {
    mockAuth('user-1')
    let updateArgs: Record<string, unknown> | null = null
    const sendReviewRequestEmail = vi.fn()
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'professionals') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1' } }) }) }) }
          if (table === 'leads') {
            return {
              select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'lead-1', professional_id: 'prof-1', opened_at: '2026-07-17T00:00:00Z', source: 'pessoal', locked: false, concluido_at: null } }) }) }),
              update: (payload: Record<string, unknown>) => { updateArgs = payload; return { eq: () => ({ eq: async () => ({ error: null }) }) } },
            }
          }
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))
    vi.doMock('@/lib/complete-lead', () => ({ sendReviewRequestEmail }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1', status: 'fechado', valor_fechado: 850, valor_fechado_decision: 'informado' }))

    expect(res.status).toBe(200)
    expect(updateArgs).toEqual({ status: 'fechado', valor_fechado: 850 })
    // "Fechado" fecha o VALOR, não confirma o trabalho feito — só "Concluído"
    // dispara o pedido de opinião (ver lib/complete-lead.ts).
    expect(sendReviewRequestEmail).not.toHaveBeenCalled()
  })

  it('fechado com decisão "nao_informar": grava valor_fechado como null', async () => {
    mockAuth('user-1')
    let updateArgs: Record<string, unknown> | null = null
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'professionals') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1' } }) }) }) }
          if (table === 'leads') {
            return {
              select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'lead-1', professional_id: 'prof-1', opened_at: '2026-07-17T00:00:00Z', source: 'pessoal', locked: false, concluido_at: null } }) }) }),
              update: (payload: Record<string, unknown>) => { updateArgs = payload; return { eq: () => ({ eq: async () => ({ error: null }) }) } },
            }
          }
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))
    vi.doMock('@/lib/complete-lead', () => ({ sendReviewRequestEmail: vi.fn() }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1', status: 'fechado', valor_fechado_decision: 'nao_informar' }))

    expect(res.status).toBe(200)
    expect(updateArgs).toEqual({ status: 'fechado', valor_fechado: null })
  })

  it('status diferente de "fechado": nunca escreve valor_fechado, mesmo que venha no pedido', async () => {
    mockAuth('user-1')
    let updateArgs: Record<string, unknown> | null = null
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'professionals') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1' } }) }) }) }
          if (table === 'leads') {
            return {
              select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'lead-1', professional_id: 'prof-1', opened_at: '2026-07-17T00:00:00Z', source: 'pessoal', locked: false, concluido_at: null } }) }) }),
              update: (payload: Record<string, unknown>) => { updateArgs = payload; return { eq: () => ({ eq: async () => ({ error: null }) }) } },
            }
          }
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))
    vi.doMock('@/lib/complete-lead', () => ({ sendReviewRequestEmail: vi.fn() }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1', status: 'qualificado', valor_fechado: 500, valor_fechado_decision: 'informado' }))

    expect(res.status).toBe(200)
    expect(updateArgs).toEqual({ status: 'qualificado' })
  })

  it('concluido pela primeira vez: grava status + concluido_at + concluido_by, e envia o pedido de opinião', async () => {
    mockAuth('user-1')
    let updateArgs: Record<string, unknown> | null = null
    const sendReviewRequestEmail = vi.fn().mockResolvedValue({ status: 'sent' })
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'professionals') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1' } }) }) }) }
          if (table === 'leads') {
            return {
              select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'lead-1', professional_id: 'prof-1', opened_at: '2026-07-17T00:00:00Z', source: 'pessoal', locked: false, concluido_at: null } }) }) }),
              update: (payload: Record<string, unknown>) => { updateArgs = payload; return { eq: () => ({ eq: async () => ({ error: null }) }) } },
            }
          }
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))
    vi.doMock('@/lib/complete-lead', () => ({ sendReviewRequestEmail }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1', status: 'concluido' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(updateArgs).toMatchObject({ status: 'concluido', concluido_by: 'prof-1' })
    expect(typeof (updateArgs as any).concluido_at).toBe('string')
    expect(sendReviewRequestEmail).toHaveBeenCalledWith('lead-1')
    expect(json.email).toEqual({ status: 'sent' })
  })

  it('concluido outra vez (reenvio): não reescreve concluido_at/concluido_by, mas volta a tentar enviar o email', async () => {
    mockAuth('user-1')
    let updateArgs: Record<string, unknown> | null = null
    const sendReviewRequestEmail = vi.fn().mockResolvedValue({ status: 'skipped', reason: 'already_sent' })
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'professionals') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1' } }) }) }) }
          if (table === 'leads') {
            return {
              // já estava concluído (concluido_at preenchido) — simula clicar
              // outra vez em "Concluído"/"Reenviar pedido de opinião"
              select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'lead-1', professional_id: 'prof-1', opened_at: '2026-07-17T00:00:00Z', source: 'pessoal', locked: false, concluido_at: '2026-08-01T00:00:00Z' } }) }) }),
              update: (payload: Record<string, unknown>) => { updateArgs = payload; return { eq: () => ({ eq: async () => ({ error: null }) }) } },
            }
          }
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))
    vi.doMock('@/lib/complete-lead', () => ({ sendReviewRequestEmail }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1', status: 'concluido' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(updateArgs).toEqual({ status: 'concluido' })
    expect(sendReviewRequestEmail).toHaveBeenCalledWith('lead-1')
    expect(json.email).toEqual({ status: 'skipped', reason: 'already_sent' })
  })

  it('concluido com falha no envio do email: estado fica gravado na mesma, erro só reportado na resposta', async () => {
    mockAuth('user-1')
    let updateArgs: Record<string, unknown> | null = null
    const sendReviewRequestEmail = vi.fn().mockResolvedValue({ status: 'failed', reason: 'Resend error 500' })
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'professionals') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1' } }) }) }) }
          if (table === 'leads') {
            return {
              select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'lead-1', professional_id: 'prof-1', opened_at: '2026-07-17T00:00:00Z', source: 'pessoal', locked: false, concluido_at: null } }) }) }),
              update: (payload: Record<string, unknown>) => { updateArgs = payload; return { eq: () => ({ eq: async () => ({ error: null }) }) } },
            }
          }
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))
    vi.doMock('@/lib/complete-lead', () => ({ sendReviewRequestEmail }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1', status: 'concluido' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.ok).toBe(true)
    expect((updateArgs as any).status).toBe('concluido')
    expect(json.email).toEqual({ status: 'failed', reason: 'Resend error 500' })
  })

  it('percurso: regista a transição no histórico quando o estado muda de facto', async () => {
    mockAuth('user-1')
    const recordLeadStatusChange = vi.fn().mockResolvedValue(undefined)
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'professionals') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1' } }) }) }) }
          if (table === 'leads') {
            return {
              select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'lead-1', professional_id: 'prof-1', opened_at: '2026-07-17T00:00:00Z', source: 'pessoal', locked: false, concluido_at: null, status: 'novo' } }) }) }),
              update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
            }
          }
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))
    vi.doMock('@/lib/complete-lead', () => ({ sendReviewRequestEmail: vi.fn() }))
    vi.doMock('@/lib/lead-status-history', () => ({ recordLeadStatusChange }))

    const { POST } = await import('./route')
    await POST(fakeRequest({ lead_id: 'lead-1', status: 'qualificado' }))

    expect(recordLeadStatusChange).toHaveBeenCalledWith({ leadId: 'lead-1', fromStatus: 'novo', toStatus: 'qualificado', changedBy: 'prof-1' })
  })

  it('percurso: nunca regista quando o estado pedido é igual ao atual (resubmissão)', async () => {
    mockAuth('user-1')
    const recordLeadStatusChange = vi.fn().mockResolvedValue(undefined)
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'professionals') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1' } }) }) }) }
          if (table === 'leads') {
            return {
              select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'lead-1', professional_id: 'prof-1', opened_at: '2026-07-17T00:00:00Z', source: 'pessoal', locked: false, concluido_at: '2026-08-01T00:00:00Z', status: 'concluido' } }) }) }),
              update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
            }
          }
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))
    vi.doMock('@/lib/complete-lead', () => ({ sendReviewRequestEmail: vi.fn().mockResolvedValue({ status: 'skipped', reason: 'already_sent' }) }))
    vi.doMock('@/lib/lead-status-history', () => ({ recordLeadStatusChange }))

    const { POST } = await import('./route')
    await POST(fakeRequest({ lead_id: 'lead-1', status: 'concluido' }))

    expect(recordLeadStatusChange).not.toHaveBeenCalled()
  })
})
