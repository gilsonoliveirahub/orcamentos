import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'
import { calculateQuote } from '@/lib/calculator'

function fakeRequest(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest
}

function mockLeadAndQuotes(lead: Record<string, unknown>, existingQuote: Record<string, unknown> | null = null) {
  const inserted: Record<string, unknown>[] = []
  vi.doMock('@/lib/supabase-admin', () => ({
    supabaseAdmin: {
      from: (table: string) => {
        if (table === 'leads') return { select: () => ({ eq: () => ({ single: async () => ({ data: lead }) }) }) }
        if (table === 'quotes') {
          return {
            // Leitura da quote existente (guard P0 contra recálculo indevido).
            select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: existingQuote }) }) }),
            upsert: (payload: Record<string, unknown>) => {
              inserted.push(payload)
              return { select: () => ({ single: async () => ({ data: { id: 'quote-1', ...payload } }) }) }
            },
          }
        }
        throw new Error(`tabela inesperada: ${table}`)
      },
    },
  }))
  return { inserted }
}

describe('POST /api/quote/generate — proteção contra acesso direto a lead bloqueado', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => { vi.restoreAllMocks(); vi.doUnmock('@/lib/supabase-admin') })

  it('recusa gerar orçamento (que embutiria nome/telefone na proposta) para um lead ainda não autorizado', async () => {
    const lead = { id: 'lead-1', source: 'pessoal', opened_at: null, locked: false, professionals: {} }
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: lead }) }) }) }) },
    }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1' }))

    expect(res.status).toBe(403)
  })

  it('lead do marketplace ainda bloqueado (locked=true): também recusa, mesmo chamando a API diretamente', async () => {
    const lead = { id: 'lead-2', source: 'marketplace', opened_at: null, locked: true, professionals: {} }
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: lead }) }) }) }) },
    }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-2' }))

    expect(res.status).toBe(403)
  })

  it('lead autorizado (já aberto): prossegue para gerar o orçamento (não devolve 403)', async () => {
    const lead = {
      id: 'lead-3', source: 'pessoal', opened_at: '2026-07-01T00:00:00Z', locked: false,
      q3_area_m2: 50, q1_tipo_trabalho: 'interior',
      professionals: { price_m2_walls: 4, price_m2_ceiling: 5, price_m2_exterior: 6, min_quote: 150 },
    }
    mockLeadAndQuotes(lead)

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-3' }))

    expect(res.status).not.toBe(403)
  })

  it('recusa recalcular quando a proposta já foi enviada ao cliente (status=enviado)', async () => {
    const lead = {
      id: 'lead-f', source: 'pessoal', opened_at: '2026-07-01T00:00:00Z', locked: false,
      q3_area_m2: 50, q1_tipo_trabalho: 'interior',
      professionals: { price_m2_walls: 4, price_m2_ceiling: 5, price_m2_exterior: 6, min_quote: 150 },
    }
    mockLeadAndQuotes(lead, { status: 'enviado', value_source: 'calculated' })

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-f' }))
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json.error).toBe('blocked')
  })

  it('recusa recalcular quando o valor foi editado manualmente (value_source=manual)', async () => {
    const lead = {
      id: 'lead-g', source: 'pessoal', opened_at: '2026-07-01T00:00:00Z', locked: false,
      q3_area_m2: 50, q1_tipo_trabalho: 'interior',
      professionals: { price_m2_walls: 4, price_m2_ceiling: 5, price_m2_exterior: 6, min_quote: 150 },
    }
    mockLeadAndQuotes(lead, { status: 'rascunho', value_source: 'manual' })

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-g' }))
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json.error).toBe('blocked')
  })
})

describe('POST /api/quote/generate — precisão de area_tetos (movido do cliente para o servidor)', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => { vi.restoreAllMocks(); vi.doUnmock('@/lib/supabase-admin') })

  const prices = { price_m2_walls: 4, price_m2_ceiling: 5, price_m2_exterior: 6, extra_color_change: 1.25, extra_cracks: 6, extra_furniture_move: 50, extra_primer: 2, min_quote: 150 }
  const professional = { price_m2_walls: 4, price_m2_ceiling: 5, price_m2_exterior: 6, min_quote: 150 }

  it('formulário novo (metadata.altura_paredes presente): usa calcPaintingAreas(metadata) — mesmo cálculo exato que antes corria no cliente', async () => {
    const lead = {
      id: 'lead-a', source: 'pessoal', opened_at: '2026-07-01T00:00:00Z', locked: false,
      q3_area_m2: 94, q1_tipo_trabalho: 'interior',
      metadata: { altura_paredes: '2.4m', num_quartos: '2', tem_sala: 'Sim', tem_hall: 'Não', area_total_m2: '12' },
      professionals: professional,
    }
    const { inserted } = mockLeadAndQuotes(lead)

    const { POST } = await import('./route')
    await POST(fakeRequest({ lead_id: 'lead-a' }))

    // area_paredes=94 (já vem do lead), area_tetos=12 (calcPaintingAreas via area_total_m2)
    const expected = calculateQuote({ area_m2_paredes: 94, area_m2_tetos: 12, tipo: 'interior', mudanca_cor: false, fissuras: false, mobilias: false, primer: false, prices })
    expect(inserted[0]).toMatchObject({ valor_base: expected.valor_base, valor_final: expected.valor_final, valor_min: expected.valor_min, valor_max: expected.valor_max, value_source: 'calculated' })
  })

  it('formulário antigo (metadata.area_m2_tetos, sem altura_paredes): usa o valor exato em vez do heurístico de 30%', async () => {
    const lead = {
      id: 'lead-b', source: 'pessoal', opened_at: '2026-07-01T00:00:00Z', locked: false,
      q3_area_m2: 50, q1_tipo_trabalho: 'interior', q8_teto: true,
      metadata: { area_m2_tetos: '8.5' },
      professionals: professional,
    }
    const { inserted } = mockLeadAndQuotes(lead)

    const { POST } = await import('./route')
    await POST(fakeRequest({ lead_id: 'lead-b' }))

    const expected = calculateQuote({ area_m2_paredes: 50, area_m2_tetos: 8.5, tipo: 'interior', mudanca_cor: false, fissuras: false, mobilias: false, primer: false, prices })
    expect(inserted[0]).toMatchObject({ valor_final: expected.valor_final })
  })

  it('lead antigo sem metadata (anterior a esta funcionalidade), q8_teto=true: mantém o heurístico de 30% — nunca altera leads antigos', async () => {
    const lead = {
      id: 'lead-c', source: 'pessoal', opened_at: '2026-07-01T00:00:00Z', locked: false,
      q3_area_m2: 50, q1_tipo_trabalho: 'interior', q8_teto: true,
      professionals: professional,
      // sem campo `metadata` — simula um lead criado antes desta coluna existir
    }
    const { inserted } = mockLeadAndQuotes(lead)

    const { POST } = await import('./route')
    await POST(fakeRequest({ lead_id: 'lead-c' }))

    // heurístico antigo: area_tetos = round(area_paredes * 0.3) = round(15) = 15
    const expected = calculateQuote({ area_m2_paredes: 50, area_m2_tetos: 15, tipo: 'interior', mudanca_cor: false, fissuras: false, mobilias: false, primer: false, prices })
    expect(inserted[0]).toMatchObject({ valor_final: expected.valor_final })
  })

  it('q1_tipo_trabalho vem capitalizado do formulário ("Interior", não "interior"): tipo é reconhecido e o cálculo por área corre — não cai no min_quote (bug real do lead da Elisa Reuter)', async () => {
    const lead = {
      id: 'lead-e', source: 'pessoal', opened_at: '2026-07-01T00:00:00Z', locked: false,
      q3_area_m2: 171, q1_tipo_trabalho: 'Interior', q4_cor_escura: true,
      metadata: { altura_paredes: '2.4m', num_quartos: '4 ou mais', tem_sala: 'Sim', tem_hall: 'Sim', area_total_m2: '130' },
      professionals: { price_m2_walls: 7, price_m2_ceiling: 8, price_m2_exterior: 10, extra_dark_color: 1.25, min_quote: 200 },
    }
    const { inserted } = mockLeadAndQuotes(lead)

    const { POST } = await import('./route')
    await POST(fakeRequest({ lead_id: 'lead-e' }))

    const expected = calculateQuote({
      area_m2_paredes: 171, area_m2_tetos: 130, tipo: 'interior', mudanca_cor: true,
      fissuras: false, mobilias: false, primer: false,
      prices: { price_m2_walls: 7, price_m2_ceiling: 8, price_m2_exterior: 10, extra_color_change: 1.25, extra_cracks: 6, extra_furniture_move: 50, extra_primer: 2, min_quote: 200 },
    })
    expect(inserted[0].valor_base).toBeGreaterThan(0)
    expect(inserted[0]).toMatchObject({ valor_base: expected.valor_base, valor_final: expected.valor_final, valor_min: expected.valor_min, valor_max: expected.valor_max })
    // O texto gravado tem de refletir sempre os mesmos valor_min/valor_max
    // gravados nas colunas estruturadas — nunca divergir (ver lib/calculator.test.ts
    // para o caso real em que isto partiu: texto ficou com €184–220 depois de
    // os valores estruturados terem sido corrigidos para €2.168–2.592).
    expect(inserted[0].proposal_text).toContain(`€${expected.valor_min}`)
    expect(inserted[0].proposal_text).toContain(`€${expected.valor_max}`)
  })

  it('P1: usa os preços de Pintura configurados em professional_pricing para esta especialidade, não o legacy partilhado', async () => {
    const lead = {
      id: 'lead-h', source: 'pessoal', opened_at: '2026-07-01T00:00:00Z', locked: false,
      q3_area_m2: 100, q1_tipo_trabalho: 'interior',
      professionals: {
        ...professional, // legacy: price_m2_walls 4
        professional_pricing: [{ specialty: 'Pintura', price_m2_walls: 9, price_m2_ceiling: 5, price_m2_exterior: 6, min_quote: 150 }],
      },
    }
    const { inserted } = mockLeadAndQuotes(lead)

    const { POST } = await import('./route')
    await POST(fakeRequest({ lead_id: 'lead-h' }))

    const expected = calculateQuote({
      area_m2_paredes: 100, area_m2_tetos: 0, tipo: 'interior', mudanca_cor: false, fissuras: false, mobilias: false, primer: false,
      prices: { ...prices, price_m2_walls: 9 },
    })
    expect(inserted[0]).toMatchObject({ valor_base: expected.valor_base, valor_final: expected.valor_final })
    // Confirma que não usou o legacy (4€/m²), que daria um valor_base menor.
    expect(inserted[0].valor_base).not.toBe(400) // 100m² × 4€/m² legacy
  })

  it('P1: subserviço "paredes exterior" nunca contamina o cálculo de um trabalho interior, mesmo configurados em simultâneo', async () => {
    const lead = {
      id: 'lead-i', source: 'pessoal', opened_at: '2026-07-01T00:00:00Z', locked: false,
      q3_area_m2: 100, q1_tipo_trabalho: 'interior', // pedido interior
      professionals: {
        ...professional,
        professional_pricing: [
          { specialty: 'Pintura', subservico: 'paredes_interior', price_per_m2: 9 },
          { specialty: 'Pintura', subservico: 'paredes_exterior', price_per_m2: 50 }, // nunca deve ser usado aqui
        ],
      },
    }
    const { inserted } = mockLeadAndQuotes(lead)

    const { POST } = await import('./route')
    await POST(fakeRequest({ lead_id: 'lead-i' }))

    // 100m² × 9€/m² (paredes_interior) = 900€ de base — nunca 100×50=5000€
    // (paredes_exterior) nem o legacy (4€/m²).
    expect(inserted[0].valor_base).toBe(900)
    expect(inserted[0].valor_base).not.toBe(400) // 100m² × 4€/m² legacy
  })

  it('lead antigo sem metadata, q8_teto=false: area_tetos=0, como antes', async () => {
    const lead = {
      id: 'lead-d', source: 'pessoal', opened_at: '2026-07-01T00:00:00Z', locked: false,
      q3_area_m2: 50, q1_tipo_trabalho: 'interior', q8_teto: false,
      professionals: professional,
    }
    const { inserted } = mockLeadAndQuotes(lead)

    const { POST } = await import('./route')
    await POST(fakeRequest({ lead_id: 'lead-d' }))

    const expected = calculateQuote({ area_m2_paredes: 50, area_m2_tetos: 0, tipo: 'interior', mudanca_cor: false, fissuras: false, mobilias: false, primer: false, prices })
    expect(inserted[0]).toMatchObject({ valor_final: expected.valor_final })
  })
})
