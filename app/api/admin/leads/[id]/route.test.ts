import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

function fakeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('GET /api/admin/leads/[id]', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => { vi.restoreAllMocks(); vi.doUnmock('@/lib/admin-auth'); vi.doUnmock('@/lib/supabase-admin') })

  const lead = {
    id: 'lead-1', name: 'Cliente X', phone: '351911111111', email: 'x@x.com', status: 'concluido',
    source: 'pessoal', specialty: 'Pintura', zone_requested: 'Lisboa', lat: null, lng: null,
    professional_id: 'p1', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-05T00:00:00Z',
    opened_at: '2026-01-01T01:00:00Z', locked: null, valor_fechado: 500,
    concluido_at: '2026-01-06T00:00:00Z', concluido_by: 'p1', current_question: 12,
    metadata: {}, q1_tipo_trabalho: 'Interior', q2_divisoes: null, q3_area_m2: 40, q4_cor_escura: false,
    q5_fissuras: false, q6_mobilias: false, q7_primer: false, q8_teto: false, q9_prazo: null,
    q10_orcamentos_anteriores: false, q11_fotos_url: ['https://x/1.jpg'], q12_notas: 'Nota',
    professionals: { id: 'p1', name: 'Ana', email: 'ana@x.com', phone: null, specialty: 'Pintura', zone: 'Lisboa', slug: 'ana' },
  }
  const quotes = [{ id: 'q1', area_m2: 40, valor_base: 300, extras_total: 0, valor_final: 300, valor_min: 250, valor_max: 350, proposal_text: 'texto', status: 'rascunho', sent_at: null, created_at: '2026-01-01T00:00:00Z' }]
  const client = { id: 'c1', name: 'Cliente X', email: 'x@x.com' }
  const review = { id: 'r1', rating: 5, comment: 'Excelente', client_name: 'Cliente X', created_at: '2026-01-07T00:00:00Z' }

  function mockDeps({ isAdmin = true, leadData = lead, reviewData = null as unknown, statusHistory = [] as unknown[] }: { isAdmin?: boolean; leadData?: unknown; reviewData?: unknown; statusHistory?: unknown[] } = {}) {
    vi.doMock('@/lib/admin-auth', () => ({ getAuthenticatedAdmin: async () => (isAdmin ? { id: 'admin-1' } : null) }))
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'leads') return { select: () => ({ eq: () => ({ single: async () => ({ data: leadData, error: leadData ? null : { message: 'not found' } }) }) }) }
          if (table === 'quotes') return { select: () => ({ eq: () => ({ order: async () => ({ data: quotes, error: null }) }) }) }
          if (table === 'clients') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: client }) }) }) }
          if (table === 'reviews') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: reviewData }) }) }) }
          if (table === 'lead_status_history') return { select: () => ({ eq: () => ({ order: async () => ({ data: statusHistory, error: null }) }) }) }
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))
  }

  it('bloqueia quem não é admin', async () => {
    mockDeps({ isAdmin: false })
    const { GET } = await import('./route')
    const res = await GET({} as unknown as NextRequest, fakeParams('lead-1'))
    expect(res.status).toBe(403)
  })

  it('devolve 404 se o lead não existir', async () => {
    mockDeps({ leadData: null })
    const { GET } = await import('./route')
    const res = await GET({} as unknown as NextRequest, fakeParams('inexistente'))
    expect(res.status).toBe(404)
  })

  it('devolve lead completo, access_state, propostas e conta de cliente associada por telefone', async () => {
    mockDeps()
    const { GET } = await import('./route')
    const res = await GET({} as unknown as NextRequest, fakeParams('lead-1'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.lead.name).toBe('Cliente X')
    expect(json.lead.q11_fotos_url).toEqual(['https://x/1.jpg'])
    expect(json.access_state).toBe('aberto')
    expect(json.quotes).toHaveLength(1)
    expect(json.client).toEqual(client)
  })

  it('lead concluído mas ainda sem opinião do cliente: review vem null, nunca inventado', async () => {
    mockDeps({ reviewData: null })
    const { GET } = await import('./route')
    const res = await GET({} as unknown as NextRequest, fakeParams('lead-1'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.lead.concluido_at).toBe('2026-01-06T00:00:00Z')
    expect(json.lead.concluido_by).toBe('p1')
    expect(json.review).toBeNull()
  })

  it('lead concluído com opinião já recebida: devolve a review associada, separada da conclusão', async () => {
    mockDeps({ reviewData: review })
    const { GET } = await import('./route')
    const res = await GET({} as unknown as NextRequest, fakeParams('lead-1'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.review).toEqual(review)
  })

  it('devolve o percurso (status_history) ordenado, vazio quando não há nenhum registo', async () => {
    mockDeps()
    const { GET } = await import('./route')
    const res = await GET({} as unknown as NextRequest, fakeParams('lead-1'))
    const json = await res.json()
    expect(json.status_history).toEqual([])
  })

  it('percurso: devolve as transições reais quando existem', async () => {
    const history = [
      { id: 'h1', from_status: null, to_status: 'novo', changed_at: '2026-01-01T00:00:00Z', professionals: null },
      { id: 'h2', from_status: 'novo', to_status: 'qualificado', changed_at: '2026-01-02T00:00:00Z', professionals: { name: 'Ana' } },
    ]
    mockDeps({ statusHistory: history })
    const { GET } = await import('./route')
    const res = await GET({} as unknown as NextRequest, fakeParams('lead-1'))
    const json = await res.json()
    expect(json.status_history).toEqual(history)
  })
})
