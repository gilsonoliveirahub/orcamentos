import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

function fakeRequest(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest
}

function mockLeadAndQuotes(lead: Record<string, unknown>, existingQuote: Record<string, unknown> | null = null) {
  const upserts: Record<string, unknown>[] = []
  vi.doMock('@/lib/supabase-admin', () => ({
    supabaseAdmin: {
      from: (table: string) => {
        if (table === 'leads') return { select: () => ({ eq: () => ({ single: async () => ({ data: lead }) }) }) }
        if (table === 'quotes') {
          return {
            // Leitura da quote existente (guard P0 contra recálculo indevido).
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

describe('POST /api/quote/hours — profissões "por hora" (Fase 2, 2026-09-16)', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => { vi.restoreAllMocks(); vi.doUnmock('@/lib/supabase-admin') })

  const baseLead = {
    id: 'lead-1', source: 'pessoal', opened_at: '2026-07-01T00:00:00Z', locked: false, professional_id: 'prof-1',
    name: 'Cliente Teste', q1_tipo_trabalho: 'Canalização', metadata: {},
    professionals: { name: 'Profissional Teste', specialty: 'Canalização', price_per_hour: 30, min_quote: 50 },
  }

  it('recusa para lead ainda não autorizado', async () => {
    const lead = { ...baseLead, opened_at: null, source: 'pessoal' }
    mockLeadAndQuotes(lead)
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1', horas: 3 }))
    expect(res.status).toBe(403)
  })

  it('recusa horas inválidas (zero, negativas ou não numéricas) sem tocar na BD', async () => {
    mockLeadAndQuotes(baseLead)
    const { POST } = await import('./route')
    for (const horas of [0, -1, 'abc', null]) {
      const res = await POST(fakeRequest({ lead_id: 'lead-1', horas }))
      expect(res.status).toBe(400)
    }
  })

  it('calcula preço por hora × horas, respeitando o mínimo, e grava valor+texto juntos', async () => {
    const { upserts } = mockLeadAndQuotes(baseLead)
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1', horas: 5 }))
    const json = await res.json()

    // 5h × 30€/h = 150€, acima do mínimo (50€)
    expect(upserts[0]).toMatchObject({ valor_final: 150, valor_min: 150, valor_max: 150, horas_estimadas: 5, value_source: 'calculated' })
    expect(json.quote.proposal_text).toContain('€150')
    // min===max: nunca deve dizer "Entre €150 e €150"
    expect(json.quote.proposal_text).not.toContain('Entre')
  })

  it('aplica o min_quote quando horas × preço fica abaixo dele', async () => {
    const { upserts } = mockLeadAndQuotes(baseLead)
    const { POST } = await import('./route')
    await POST(fakeRequest({ lead_id: 'lead-1', horas: 1 }))
    // 1h × 30€ = 30€, abaixo do mínimo de 50€
    expect(upserts[0].valor_final).toBe(50)
  })

  it('recusa quando o profissional ainda não configurou preço por hora', async () => {
    const lead = { ...baseLead, professionals: { ...baseLead.professionals, price_per_hour: null } }
    mockLeadAndQuotes(lead)
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1', horas: 3 }))
    expect(res.status).toBe(400)
  })

  it('chamar duas vezes atualiza a mesma proposta em vez de duplicar (onConflict: lead_id)', async () => {
    const { upserts } = mockLeadAndQuotes(baseLead)
    const { POST } = await import('./route')
    await POST(fakeRequest({ lead_id: 'lead-1', horas: 2 }))
    await POST(fakeRequest({ lead_id: 'lead-1', horas: 4 }))
    expect(upserts).toHaveLength(2)
    expect(upserts[1].valor_final).toBe(120) // 4h × 30€
  })

  it('usa lead.specialty (o que o cliente pediu) no texto da proposta, nunca a especialidade "principal" do profissional', async () => {
    // Profissional é "principal" Electricidade, mas este lead concreto
    // (ex: adquirido no marketplace) pediu Canalização.
    const lead = {
      ...baseLead,
      specialty: 'Canalização',
      professionals: { ...baseLead.professionals, specialty: 'Electricidade' },
    }
    mockLeadAndQuotes(lead)
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1', horas: 2 }))
    const json = await res.json()
    expect(json.quote.proposal_text).toContain('CANALIZAÇÃO')
    expect(json.quote.proposal_text).not.toContain('ELECTRICIDADE')
  })

  it('recusa recalcular quando a proposta já foi enviada ao cliente (status=enviado)', async () => {
    mockLeadAndQuotes(baseLead, { status: 'enviado', value_source: 'calculated' })
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1', horas: 3 }))
    const json = await res.json()
    expect(res.status).toBe(409)
    expect(json.error).toBe('blocked')
  })

  it('recusa recalcular quando o valor foi editado manualmente (value_source=manual)', async () => {
    mockLeadAndQuotes(baseLead, { status: 'rascunho', value_source: 'manual' })
    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1', horas: 3 }))
    const json = await res.json()
    expect(res.status).toBe(409)
    expect(json.error).toBe('blocked')
  })
})
