import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'
import { calculateQuote } from '@/lib/calculator'

function fakeRequest(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest
}

function mockLeadAndQuotes(lead: Record<string, unknown>) {
  const inserted: Record<string, unknown>[] = []
  vi.doMock('@/lib/supabase-admin', () => ({
    supabaseAdmin: {
      from: (table: string) => {
        if (table === 'leads') return { select: () => ({ eq: () => ({ single: async () => ({ data: lead }) }) }) }
        if (table === 'quotes') {
          return {
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
    const inserted: Record<string, unknown>[] = []
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'leads') return { select: () => ({ eq: () => ({ single: async () => ({ data: lead }) }) }) }
          if (table === 'quotes') return { insert: (payload: Record<string, unknown>) => { inserted.push(payload); return { select: () => ({ single: async () => ({ data: { id: 'quote-1', ...payload } }) }) } } }
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-3' }))

    expect(res.status).not.toBe(403)
  })
})

describe('POST /api/quote/generate — precisão de area_tetos (movido do cliente para o servidor)', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => { vi.restoreAllMocks(); vi.doUnmock('@/lib/supabase-admin') })

  const prices = { price_m2_walls: 4, price_m2_ceiling: 5, price_m2_exterior: 6, extra_dark_color: 1.25, extra_cracks: 6, extra_furniture_move: 50, extra_primer: 2, min_quote: 150 }
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
    const expected = calculateQuote({ area_m2_paredes: 94, area_m2_tetos: 12, tipo: 'interior', cor_escura: false, fissuras: false, mobilias: false, primer: false, prices })
    expect(inserted[0]).toMatchObject({ valor_base: expected.valor_base, valor_final: expected.valor_final, valor_min: expected.valor_min, valor_max: expected.valor_max })
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

    const expected = calculateQuote({ area_m2_paredes: 50, area_m2_tetos: 8.5, tipo: 'interior', cor_escura: false, fissuras: false, mobilias: false, primer: false, prices })
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
    const expected = calculateQuote({ area_m2_paredes: 50, area_m2_tetos: 15, tipo: 'interior', cor_escura: false, fissuras: false, mobilias: false, primer: false, prices })
    expect(inserted[0]).toMatchObject({ valor_final: expected.valor_final })
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

    const expected = calculateQuote({ area_m2_paredes: 50, area_m2_tetos: 0, tipo: 'interior', cor_escura: false, fissuras: false, mobilias: false, primer: false, prices })
    expect(inserted[0]).toMatchObject({ valor_final: expected.valor_final })
  })
})
