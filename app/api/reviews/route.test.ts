import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'
import { generateReviewToken } from '@/lib/review-token'

const ORIGINAL_ENV = { ...process.env }
const SECRET = 'segredo-review-teste'

function fakeRequest(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest
}

function fakeGetRequest(params: Record<string, string>): NextRequest {
  const searchParams = new URLSearchParams(params)
  return { nextUrl: { searchParams } } as unknown as NextRequest
}

function mockAuth(userId: string | null) {
  vi.doMock('@/lib/supabase-server', () => ({
    createClient: async () => ({
      auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null } }) },
    }),
  }))
}

function mockDb({
  lead = { id: 'lead-1', professional_id: 'prof-1', name: 'Cliente', phone: '351911111111' },
  existingReview = null as { id: string } | null,
  insertError = null as { code: string; message: string } | null,
  client = null as { phone: string } | null,
}: {
  lead?: { id: string; professional_id: string; name: string; phone: string } | null
  existingReview?: { id: string } | null
  insertError?: { code: string; message: string } | null
  client?: { phone: string } | null
} = {}) {
  const inserted: Record<string, unknown>[] = []
  const from = vi.fn((table: string) => {
    if (table === 'leads') {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: lead }) }) }) }
    }
    if (table === 'clients') {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: client }) }) }) }
    }
    if (table === 'professionals') {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { name: 'Prof', slug: 'prof', avatar_url: null, specialty: 'Pintura' } }) }) }) }
    }
    if (table === 'reviews') {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: existingReview }) }) }),
        insert: (payload: Record<string, unknown>) => {
          inserted.push(payload)
          return {
            select: () => ({
              single: async () => insertError
                ? { data: null, error: insertError }
                : { data: { id: 'review-1', ...payload }, error: null },
            }),
          }
        },
      }
    }
    throw new Error(`tabela inesperada: ${table}`)
  })
  vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))
  return { inserted }
}

describe('POST /api/reviews — autorização (token ou dono autenticado, nunca só o lead_id)', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env = { ...ORIGINAL_ENV, REVIEW_TOKEN_SECRET: SECRET }
  })
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.restoreAllMocks()
    vi.doUnmock('@/lib/supabase-admin')
    vi.doUnmock('@/lib/supabase-server')
  })

  it('fraude: só conhecer o lead_id, sem token e sem sessão — 403, nunca insere', async () => {
    mockAuth(null)
    const { inserted } = mockDb()
    const { POST } = await import('./route')

    const res = await POST(fakeRequest({ lead_id: 'lead-1', rating: 5, client_name: 'Falso Cliente' }))
    expect(res.status).toBe(403)
    expect(inserted).toHaveLength(0)
  })

  it('fraude: token adulterado (ex: o profissional tenta adivinhar/forjar um token a partir do lead_id que já conhece) — 403', async () => {
    mockAuth(null)
    const { inserted } = mockDb()
    const { POST } = await import('./route')

    const tampered = generateReviewToken('lead-1', SECRET).replace(/^./, c => (c === 'a' ? 'b' : 'a'))
    const res = await POST(fakeRequest({ lead_id: 'lead-1', rating: 5, client_name: 'Falso Cliente', token: tampered }))
    expect(res.status).toBe(403)
    expect(inserted).toHaveLength(0)
  })

  it('fraude: token válido para OUTRO lead_id — 403 (o token está atado a um lead específico)', async () => {
    mockAuth(null)
    const { inserted } = mockDb()
    const { POST } = await import('./route')

    const tokenDeOutroLead = generateReviewToken('lead-999', SECRET)
    const res = await POST(fakeRequest({ lead_id: 'lead-1', rating: 5, client_name: 'Falso Cliente', token: tokenDeOutroLead }))
    expect(res.status).toBe(403)
    expect(inserted).toHaveLength(0)
  })

  it('fraude: cliente autenticado mas dono de OUTRO telefone (não é o dono deste lead) — 403', async () => {
    mockAuth('user-1')
    const { inserted } = mockDb({ client: { phone: '351900000000' } }) // lead.phone é 351911111111
    const { POST } = await import('./route')

    const res = await POST(fakeRequest({ lead_id: 'lead-1', rating: 5, client_name: 'Cliente' }))
    expect(res.status).toBe(403)
    expect(inserted).toHaveLength(0)
  })

  it('sem REVIEW_TOKEN_SECRET configurado no servidor: um token (mesmo que "correto") nunca é aceite — nunca falha aberto', async () => {
    delete process.env.REVIEW_TOKEN_SECRET
    mockAuth(null)
    mockDb()
    const { POST } = await import('./route')

    // Token gerado com o mesmo segredo que o cliente teria recebido, mas o
    // servidor agora não tem REVIEW_TOKEN_SECRET configurado.
    const token = generateReviewToken('lead-1', SECRET)
    const res = await POST(fakeRequest({ lead_id: 'lead-1', rating: 5, client_name: 'Cliente', token }))
    expect(res.status).toBe(403)
  })

  it('legítimo: token de avaliação válido (fluxo /avaliar, sem sessão) — aceite', async () => {
    mockAuth(null)
    const { inserted } = mockDb()
    const { POST } = await import('./route')

    const token = generateReviewToken('lead-1', SECRET)
    const res = await POST(fakeRequest({ lead_id: 'lead-1', rating: 5, client_name: 'Cliente Real', token }))
    expect(res.status).toBe(200)
    expect(inserted).toHaveLength(1)
  })

  it('legítimo: cliente autenticado dono do pedido (mesmo telefone), sem token (fluxo cliente/dashboard) — aceite', async () => {
    mockAuth('user-1')
    const { inserted } = mockDb({ client: { phone: '351911111111' } }) // igual ao lead.phone
    const { POST } = await import('./route')

    const res = await POST(fakeRequest({ lead_id: 'lead-1', rating: 5, client_name: 'Cliente Real' }))
    expect(res.status).toBe(200)
    expect(inserted).toHaveLength(1)
  })

  it('professional_id é sempre derivado do lead na BD, nunca do corpo do pedido, mesmo com token válido', async () => {
    mockAuth(null)
    const { inserted } = mockDb()
    const { POST } = await import('./route')

    const token = generateReviewToken('lead-1', SECRET)
    await POST(fakeRequest({ lead_id: 'lead-1', rating: 5, client_name: 'Cliente', token, professional_id: 'prof-FALSIFICADO' }))
    expect(inserted[0]).toMatchObject({ professional_id: 'prof-1' })
  })
})

describe('POST /api/reviews — validação (com token válido, isolando o resto da lógica)', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env = { ...ORIGINAL_ENV, REVIEW_TOKEN_SECRET: SECRET }
    mockAuth(null)
  })
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.restoreAllMocks()
    vi.doUnmock('@/lib/supabase-admin')
    vi.doUnmock('@/lib/supabase-server')
  })

  const token = () => generateReviewToken('lead-1', SECRET)

  it('rejeita campos em falta (sem rating)', async () => {
    mockDb()
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1', client_name: 'Cliente', token: token() }))
    expect(res.status).toBe(400)
  })

  it('rejeita rating fora do intervalo 1-5 (fraude: 0)', async () => {
    mockDb()
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1', rating: 0, client_name: 'Cliente', token: token() }))
    expect(res.status).toBe(400)
  })

  it('rejeita rating fora do intervalo 1-5 (fraude: 6)', async () => {
    mockDb()
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1', rating: 6, client_name: 'Cliente', token: token() }))
    expect(res.status).toBe(400)
  })

  it('rejeita rating não-inteiro (fraude: 4.5)', async () => {
    mockDb()
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1', rating: 4.5, client_name: 'Cliente', token: token() }))
    expect(res.status).toBe(400)
  })

  it('rejeita rating não-numérico que escaparia a uma comparação ingénua (fraude: "abc")', async () => {
    mockDb()
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1', rating: 'abc', client_name: 'Cliente', token: token() }))
    expect(res.status).toBe(400)
  })

  it('lead inexistente: 404, nunca chega a verificar duplicado nem a inserir', async () => {
    const { inserted } = mockDb({ lead: null })
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-inexistente', rating: 5, client_name: 'Cliente', token: generateReviewToken('lead-inexistente', SECRET) }))
    expect(res.status).toBe(404)
    expect(inserted).toHaveLength(0)
  })

  it('duplicado detetado no check prévio: 409, nunca insere', async () => {
    const { inserted } = mockDb({ existingReview: { id: 'review-existente' } })
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1', rating: 5, client_name: 'Cliente', token: token() }))
    const json = await res.json()
    expect(res.status).toBe(409)
    expect(json.error).toBe('Já avaliaste este serviço')
    expect(inserted).toHaveLength(0)
  })

  it('duplicado só detetado pela constraint da BD (corrida entre dois submits simultâneos): 409, não 500', async () => {
    mockDb({ insertError: { code: '23505', message: 'duplicate key value violates unique constraint "reviews_lead_id_unique"' } })
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1', rating: 5, client_name: 'Cliente', token: token() }))
    const json = await res.json()
    expect(res.status).toBe(409)
    expect(json.error).toBe('Já avaliaste este serviço')
  })

  it('outro erro de BD (não duplicado): devolve 500 com a mensagem real, não mascara como duplicado', async () => {
    mockDb({ insertError: { code: '23502', message: 'null value in column "rating" violates not-null constraint' } })
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1', rating: 5, client_name: 'Cliente', token: token() }))
    const json = await res.json()
    expect(res.status).toBe(500)
    expect(json.error).toContain('not-null constraint')
  })
})

describe('GET /api/reviews — mesma autorização exigida (token ou dono autenticado)', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env = { ...ORIGINAL_ENV, REVIEW_TOKEN_SECRET: SECRET }
  })
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.restoreAllMocks()
    vi.doUnmock('@/lib/supabase-admin')
    vi.doUnmock('@/lib/supabase-server')
  })

  it('fraude: sem token e sem sessão — 403, nunca revela nome do lead nem estado de já-avaliado', async () => {
    mockAuth(null)
    mockDb()
    const { GET } = await import('./route')
    const res = await GET(fakeGetRequest({ lead_id: 'lead-1' }))
    expect(res.status).toBe(403)
  })

  it('legítimo: com token válido — devolve os dados', async () => {
    mockAuth(null)
    mockDb()
    const { GET } = await import('./route')
    const res = await GET(fakeGetRequest({ lead_id: 'lead-1', token: generateReviewToken('lead-1', SECRET) }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.lead.id).toBe('lead-1')
  })
})
