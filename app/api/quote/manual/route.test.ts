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

// Mesmo padrão de app/api/leads/status/route.test.ts: 'professionals'
// resolve o profissional a partir do user.id da SESSÃO (nunca de um
// professional_id enviado pelo corpo do pedido); 'leads' e 'quotes' seguem
// o padrão já usado nas outras rotas de quote.
function mockDb({
  professional = { id: 'prof-1', name: 'Profissional Teste', specialty: 'Pintura' },
  lead,
  existingQuote = null,
}: {
  professional?: Record<string, unknown> | null
  lead: Record<string, unknown> | null
  existingQuote?: Record<string, unknown> | null
}) {
  const upserts: Record<string, unknown>[] = []
  vi.doMock('@/lib/supabase-admin', () => ({
    supabaseAdmin: {
      from: (table: string) => {
        if (table === 'professionals') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: professional }) }) }) }
        if (table === 'leads') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: lead }) }) }) }
        if (table === 'quotes') {
          return {
            select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: existingQuote }) }) }),
            upsert: (payload: Record<string, unknown>) => {
              upserts.push(payload)
              return { select: () => ({ single: async () => ({ data: { id: 'quote-1', ...payload }, error: null }) }) }
            },
          }
        }
        throw new Error(`tabela inesperada: ${table}`)
      },
    },
  }))
  return { upserts }
}

const baseLead = {
  id: 'lead-1', professional_id: 'prof-1', source: 'pessoal', opened_at: '2026-07-01T00:00:00Z', locked: false,
  name: 'Cliente Teste', metadata: {},
}

describe('POST /api/quote/manual — P2 (2026-09-18): rever/alterar/substituir o valor à mão', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => { vi.restoreAllMocks(); vi.doUnmock('@/lib/supabase-admin'); vi.doUnmock('@/lib/supabase-server') })

  it('exige sessão autenticada — 401 sem tocar na base de dados', async () => {
    mockAuth(null)
    const from = vi.fn()
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1', valor_final: 500 }))

    expect(res.status).toBe(401)
    expect(from).not.toHaveBeenCalled()
  })

  it('sessão válida mas sem conta de profissional associada — 403', async () => {
    mockAuth('user-1')
    mockDb({ professional: null, lead: baseLead })
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1', valor_final: 500 }))
    expect(res.status).toBe(403)
  })

  it('lead pertence a OUTRO profissional — 404 genérico, nunca revela que o lead existe, nunca escreve', async () => {
    mockAuth('user-1')
    const { upserts } = mockDb({ lead: { ...baseLead, professional_id: 'outro-prof' } })
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1', valor_final: 500 }))
    const json = await res.json()
    expect(res.status).toBe(404)
    expect(json.error).toBe('Lead não encontrado')
    expect(upserts).toHaveLength(0)
  })

  it('lead inexistente — mesma mensagem 404 genérica (não distingue de "lead de outro profissional")', async () => {
    mockAuth('user-1')
    mockDb({ lead: null })
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-inexistente', valor_final: 500 }))
    const json = await res.json()
    expect(res.status).toBe(404)
    expect(json.error).toBe('Lead não encontrado')
  })

  it('recusa para lead ainda não autorizado (ainda que pertença ao próprio profissional)', async () => {
    mockAuth('user-1')
    mockDb({ lead: { ...baseLead, opened_at: null } })
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1', valor_final: 500 }))
    expect(res.status).toBe(403)
  })

  it('recusa valores inválidos (vazio, zero, negativo, não numérico) sem tocar na BD', async () => {
    mockAuth('user-1')
    const from = vi.fn()
    // Nem chega a consultar a BD — a validação do valor corre antes de
    // qualquer leitura, ver ordem no route.ts.
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))
    const { POST } = await import('./route')
    for (const valor_final of [0, -50, 'abc', null, undefined, '']) {
      const res = await POST(fakeRequest({ lead_id: 'lead-1', valor_final }))
      expect(res.status).toBe(400)
    }
    expect(from).not.toHaveBeenCalled()
  })

  it('grava o valor indicado com value_source="manual" e valor_min=valor_max=valor_final, usando o professional_id da SESSÃO', async () => {
    mockAuth('user-1')
    const { upserts } = mockDb({ lead: baseLead })
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1', valor_final: 850 }))
    const json = await res.json()

    expect(upserts[0]).toMatchObject({ valor_final: 850, valor_min: 850, valor_max: 850, value_source: 'manual', status: 'rascunho', professional_id: 'prof-1' })
    expect(json.quote.proposal_text).toContain('€850')
    expect(json.quote.proposal_text).not.toContain('Entre')
  })

  it('ignora professional_id, value_source e outros campos sensíveis enviados no corpo do pedido — nunca confia no browser', async () => {
    mockAuth('user-1')
    const { upserts } = mockDb({ lead: baseLead })
    const { POST } = await import('./route')
    await POST(fakeRequest({
      lead_id: 'lead-1',
      valor_final: 850,
      professional_id: 'outro-prof-forjado',
      value_source: 'calculated', // tentativa de contornar o guard
      status: 'enviado', // tentativa de forjar um estado
    }))

    expect(upserts[0].professional_id).toBe('prof-1') // nunca "outro-prof-forjado"
    expect(upserts[0].value_source).toBe('manual') // nunca "calculated"
    expect(upserts[0].status).toBe('rascunho') // nunca "enviado"
  })

  it('permite substituir um valor já calculado automaticamente', async () => {
    const { upserts } = mockDb({ lead: baseLead, existingQuote: { status: 'rascunho', value_source: 'calculated' } })
    mockAuth('user-1')
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1', valor_final: 1200 }))
    expect(res.status).not.toBe(409)
    expect(upserts[0].valor_final).toBe(1200)
  })

  it('permite rever/substituir um valor já manual anteriormente (diferente do guard de recálculo automático)', async () => {
    mockAuth('user-1')
    const { upserts } = mockDb({ lead: baseLead, existingQuote: { status: 'rascunho', value_source: 'manual' } })
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1', valor_final: 999 }))
    expect(res.status).not.toBe(409)
    expect(upserts[0].valor_final).toBe(999)
  })

  it('recusa alterar depois de a proposta já ter sido enviada ao cliente', async () => {
    mockAuth('user-1')
    const { upserts } = mockDb({ lead: baseLead, existingQuote: { status: 'enviado', value_source: 'calculated' } })
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1', valor_final: 700 }))
    const json = await res.json()
    expect(res.status).toBe(409)
    expect(json.error).toBe('blocked')
    expect(upserts).toHaveLength(0)
  })

  it('recusa alterar depois de a proposta já ter sido aceite pelo cliente', async () => {
    mockAuth('user-1')
    mockDb({ lead: baseLead, existingQuote: { status: 'aceite', value_source: 'manual' } })
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1', valor_final: 700 }))
    expect(res.status).toBe(409)
  })

  it('usa a especialidade real do lead (não a "principal" do profissional) no texto da proposta', async () => {
    mockAuth('user-1')
    mockDb({
      professional: { id: 'prof-1', name: 'Profissional Teste', specialty: 'Pintura' },
      lead: { ...baseLead, specialty: 'Jardinagem' },
    })
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1', valor_final: 300 }))
    const json = await res.json()
    expect(json.proposal_text).toContain('JARDINAGEM')
    expect(json.proposal_text).not.toContain('PINTURA')
  })
})
