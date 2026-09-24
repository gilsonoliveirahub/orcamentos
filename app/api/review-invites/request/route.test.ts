import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

function fakeRequest(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest
}

// review_invites.select(...).eq(...).in(...) termina em .ilike() (canal
// email) ou .eq() (canal whatsapp) — mesmo padrão do teste de
// app/api/review-invites/route.test.ts.
function existingCheckChain(data: unknown) {
  const terminal = { maybeSingle: async () => ({ data }) }
  return { select: () => ({ eq: () => ({ in: () => ({ ilike: () => terminal, eq: () => terminal }) }) }) }
}

describe('POST /api/review-invites/request', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => {
    vi.restoreAllMocks()
    vi.doUnmock('@/lib/supabase-admin')
  })

  it('profissional em falta no corpo: 400, nunca toca na BD', async () => {
    const from = vi.fn()
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ client_name: 'Cliente', channel: 'email', client_email: 'c@example.com' }))
    expect(res.status).toBe(400)
    expect(from).not.toHaveBeenCalled()
  })

  it('profissional inexistente ou inativo: 404, nunca cria o pedido', async () => {
    const insert = vi.fn()
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'professionals') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1', active: false } }) }) }) }
          if (table === 'review_invites') return { insert }
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ professional_id: 'prof-1', client_name: 'Cliente', channel: 'email', client_email: 'c@example.com' }))
    expect(res.status).toBe(404)
    expect(insert).not.toHaveBeenCalled()
  })

  it('nome em falta: 400', async () => {
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1', active: true } }) }) }) }) },
    }))
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ professional_id: 'prof-1', client_name: '', channel: 'email', client_email: 'c@example.com' }))
    expect(res.status).toBe(400)
  })

  it('canal desconhecido: 400', async () => {
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1', active: true } }) }) }) }) },
    }))
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ professional_id: 'prof-1', client_name: 'Cliente', channel: 'sms', client_email: 'c@example.com' }))
    expect(res.status).toBe(400)
  })

  it('email inválido: 400', async () => {
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1', active: true } }) }) }) }) },
    }))
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ professional_id: 'prof-1', client_name: 'Cliente', channel: 'email', client_email: 'nao-e-email' }))
    expect(res.status).toBe(400)
  })

  it('telemóvel demasiado curto: 400', async () => {
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1', active: true } }) }) }) }) },
    }))
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ professional_id: 'prof-1', client_name: 'Cliente', channel: 'whatsapp', client_phone: '123' }))
    expect(res.status).toBe(400)
  })

  it('já existe um pedido/convite pendente para o mesmo contacto: 409, nunca cria', async () => {
    const insert = vi.fn()
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'professionals') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1', active: true } }) }) }) }
          if (table === 'review_invites') return { ...existingCheckChain({ id: 'existing' }), insert }
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ professional_id: 'prof-1', client_name: 'Cliente', channel: 'email', client_email: 'c@example.com' }))
    const json = await res.json()
    expect(res.status).toBe(409)
    expect(json.reason).toBe('already_pending')
    expect(insert).not.toHaveBeenCalled()
  })

  it('caminho feliz: cria em status "requested", nunca envia nada, devolve só ok', async () => {
    let insertArgs: Record<string, unknown> | null = null
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'professionals') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1', active: true } }) }) }) }
          if (table === 'review_invites') {
            return {
              ...existingCheckChain(null),
              insert: (payload: Record<string, unknown>) => { insertArgs = payload; return { error: null } },
            }
          }
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ professional_id: 'prof-1', client_name: '  Maria  ', channel: 'whatsapp', client_phone: '351 912 345 678' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual({ ok: true })
    expect(insertArgs).toEqual({
      professional_id: 'prof-1',
      client_name: 'Maria',
      channel: 'whatsapp',
      client_email: null,
      client_phone: '351912345678',
      status: 'requested',
    })
  })

  it('violação de constraint única (23505): 409, nunca 500', async () => {
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'professionals') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1', active: true } }) }) }) }
          if (table === 'review_invites') return { ...existingCheckChain(null), insert: () => ({ error: { code: '23505', message: 'duplicate' } }) }
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ professional_id: 'prof-1', client_name: 'Cliente', channel: 'email', client_email: 'c@example.com' }))
    const json = await res.json()
    expect(res.status).toBe(409)
    expect(json.reason).toBe('already_pending')
  })
})
