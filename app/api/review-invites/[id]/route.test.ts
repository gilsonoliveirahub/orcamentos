import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'
import { createHmac } from 'crypto'

const SECRET = 'segredo-teste-fixo'
function tokenFor(inviteId: string) {
  return createHmac('sha256', SECRET).update(`review-invite:${inviteId}`).digest('hex')
}

function fakeGetRequest(searchParams: Record<string, string>): NextRequest {
  return {
    nextUrl: { searchParams: new URLSearchParams(searchParams) },
  } as unknown as NextRequest
}

function fakePostRequest(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest
}

function fakeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('GET /api/review-invites/[id]', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.REVIEW_TOKEN_SECRET = SECRET
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.doUnmock('@/lib/supabase-admin')
    delete process.env.REVIEW_TOKEN_SECRET
  })

  it('sem token: 403, nunca chega a consultar a BD', async () => {
    const from = vi.fn()
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))
    const { GET } = await import('./route')
    const res = await GET(fakeGetRequest({}), fakeParams('invite-1'))
    expect(res.status).toBe(403)
    expect(from).not.toHaveBeenCalled()
  })

  it('token de um invite_id diferente: 403', async () => {
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: vi.fn() } }))
    const { GET } = await import('./route')
    const res = await GET(fakeGetRequest({ token: tokenFor('outro-invite') }), fakeParams('invite-1'))
    expect(res.status).toBe(403)
  })

  it('convite inexistente: 404', async () => {
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) },
    }))
    const { GET } = await import('./route')
    const res = await GET(fakeGetRequest({ token: tokenFor('invite-1') }), fakeParams('invite-1'))
    expect(res.status).toBe(404)
  })

  it('convite válido e pendente: devolve dados do convite e do profissional, already_reviewed false', async () => {
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'review_invites') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'invite-1', client_name: 'Cliente', professional_id: 'prof-1', status: 'pending' } }) }) }) }
          if (table === 'professionals') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { name: 'Ana', slug: 'ana', avatar_url: null, specialty: 'Pintura' } }) }) }) }
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))
    const { GET } = await import('./route')
    const res = await GET(fakeGetRequest({ token: tokenFor('invite-1') }), fakeParams('invite-1'))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.invite).toEqual({ id: 'invite-1', client_name: 'Cliente' })
    expect(json.professional.name).toBe('Ana')
    expect(json.already_reviewed).toBe(false)
  })

  it('convite já concluído: already_reviewed true', async () => {
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'review_invites') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'invite-1', client_name: 'Cliente', professional_id: 'prof-1', status: 'completed' } }) }) }) }
          if (table === 'professionals') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { name: 'Ana', slug: 'ana' } }) }) }) }
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))
    const { GET } = await import('./route')
    const res = await GET(fakeGetRequest({ token: tokenFor('invite-1') }), fakeParams('invite-1'))
    const json = await res.json()
    expect(json.already_reviewed).toBe(true)
  })
})

describe('POST /api/review-invites/[id]', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.REVIEW_TOKEN_SECRET = SECRET
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.doUnmock('@/lib/supabase-admin')
    delete process.env.REVIEW_TOKEN_SECRET
  })

  it('rejeita sem rating ou nome, nunca chega a tocar na BD', async () => {
    const from = vi.fn()
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))
    const { POST } = await import('./route')
    const res = await POST(fakePostRequest({ token: tokenFor('invite-1') }), fakeParams('invite-1'))
    expect(res.status).toBe(400)
    expect(from).not.toHaveBeenCalled()
  })

  it('rating fora de 1-5: 400', async () => {
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: vi.fn() } }))
    const { POST } = await import('./route')
    const res = await POST(fakePostRequest({ rating: 7, client_name: 'Cliente', token: tokenFor('invite-1') }), fakeParams('invite-1'))
    expect(res.status).toBe(400)
  })

  it('sem token válido: 403, nunca escreve', async () => {
    const from = vi.fn()
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))
    const { POST } = await import('./route')
    const res = await POST(fakePostRequest({ rating: 5, client_name: 'Cliente', token: 'token-errado' }), fakeParams('invite-1'))
    expect(res.status).toBe(403)
    expect(from).not.toHaveBeenCalled()
  })

  it('convite já concluído: 409, nunca duplica', async () => {
    const insert = vi.fn()
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'review_invites') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'invite-1', professional_id: 'prof-1', status: 'completed' } }) }) }) }
          if (table === 'reviews') return { insert }
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))
    const { POST } = await import('./route')
    const res = await POST(fakePostRequest({ rating: 5, client_name: 'Cliente', token: tokenFor('invite-1') }), fakeParams('invite-1'))
    const json = await res.json()
    expect(res.status).toBe(409)
    expect(json.error).toBe('Já avaliaste este serviço')
    expect(insert).not.toHaveBeenCalled()
  })

  it('caminho feliz: grava a review com source=convidado, invite_id preenchido, lead_id nunca tocado, e marca o convite como concluído', async () => {
    let insertArgs: Record<string, unknown> | null = null
    let updateArgs: Record<string, unknown> | null = null
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'review_invites') {
            return {
              select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'invite-1', professional_id: 'prof-1', status: 'pending' } }) }) }),
              update: (payload: Record<string, unknown>) => { updateArgs = payload; return { eq: async () => ({ error: null }) } },
            }
          }
          if (table === 'reviews') {
            return {
              insert: (payload: Record<string, unknown>) => {
                insertArgs = payload
                return { select: () => ({ single: async () => ({ data: { id: 'review-1', ...payload }, error: null }) }) }
              },
            }
          }
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))
    const { POST } = await import('./route')
    const res = await POST(fakePostRequest({ rating: 5, comment: 'Excelente', client_name: '  Gilson  ', token: tokenFor('invite-1') }), fakeParams('invite-1'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(insertArgs).toEqual({
      professional_id: 'prof-1',
      invite_id: 'invite-1',
      source: 'convidado',
      client_name: 'Gilson',
      rating: 5,
      comment: 'Excelente',
    })
    expect((updateArgs as any).status).toBe('completed')
    expect(json.review.id).toBe('review-1')
  })

  it('violação de constraint única (23505) — dois submits simultâneos do mesmo convite: 409, nunca 500', async () => {
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'review_invites') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'invite-1', professional_id: 'prof-1', status: 'pending' } }) }) }) }
          if (table === 'reviews') return { insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { code: '23505', message: 'duplicate' } }) }) }) }
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))
    const { POST } = await import('./route')
    const res = await POST(fakePostRequest({ rating: 5, client_name: 'Cliente', token: tokenFor('invite-1') }), fakeParams('invite-1'))
    const json = await res.json()
    expect(res.status).toBe(409)
    expect(json.error).toBe('Já avaliaste este serviço')
  })
})
