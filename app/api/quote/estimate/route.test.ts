import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

function fakeRequest(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest
}

// Mock padrão da tabela `quotes`: cobre tanto o select() de leitura da quote
// existente (guard P0 contra recálculo indevido) como o upsert() de escrita.
// `existingQuote` por omissão é null (sem quote anterior — comportamento
// igual ao que existia antes desta proteção ser acrescentada).
function mockQuotesTable(existingQuote: any = null, upsertResult: any = { id: 'quote-1' }) {
  return {
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: existingQuote }) }) }),
    upsert: (payload: any) => ({
      select: () => ({
        single: async () => ({ data: { ...upsertResult, ...payload } }),
      }),
    }),
  }
}

describe('POST /api/quote/estimate — proteção contra acesso direto a lead bloqueado', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => { vi.restoreAllMocks(); vi.doUnmock('@/lib/supabase-admin') })

  it('recusa gerar orçamento (que embutiria nome/telefone na proposta) para um lead ainda não autorizado', async () => {
    const lead = { id: 'lead-1', source: 'pessoal', opened_at: null, locked: false, metadata: {}, professionals: {} }
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: lead }) }) }) }) },
    }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1' }))

    expect(res.status).toBe(403)
  })

  it('lead do marketplace ainda bloqueado (locked=true): também recusa, mesmo chamando a API diretamente', async () => {
    const lead = { id: 'lead-2', source: 'marketplace', opened_at: null, locked: true, metadata: {}, professionals: {} }
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
      name: 'Cliente Autorizado', metadata: {},
      professionals: { specialty: 'Outro', name: 'Profissional' },
    }
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'leads') return { select: () => ({ eq: () => ({ single: async () => ({ data: lead }) }) }) }
          if (table === 'quotes') return mockQuotesTable()
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-3' }))

    expect(res.status).not.toBe(403)
  })

  it('nunca inclui as URLs de fotos/vídeo em bruto no texto da proposta enviada ao cliente', async () => {
    // Especialidade com fórmula própria em PRICE_TABLES (Canalização) —
    // desde a remoção do fallback genérico "Outro" (P0, 2026-09-18), uma
    // especialidade sem fórmula própria e sem preço do profissional já não
    // gera proposal_text nenhum (fica "estimativa indisponível", testado à
    // parte); este teste precisa de uma proposta real para verificar que a
    // proposta em si nunca inclui as URLs em bruto.
    const lead = {
      id: 'lead-4', source: 'pessoal', opened_at: '2026-07-01T00:00:00Z', locked: false,
      name: 'Cliente Autorizado',
      metadata: { tipo_trabalho: 'Fuga de água', media_urls: ['https://x/1.jpg', 'https://x/2.jpg'] },
      professionals: { specialty: 'Canalização', name: 'Profissional' },
    }
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'leads') return { select: () => ({ eq: () => ({ single: async () => ({ data: lead }) }) }) }
          if (table === 'quotes') return mockQuotesTable()
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-4' }))
    const json = await res.json()

    expect(json.proposal_text).not.toContain('https://x/1.jpg')
    expect(json.proposal_text).not.toContain('media urls')
  })

  it('usa lead.specialty (o que o cliente pediu), nunca professionals.specialty, quando ambos existem e divergem', async () => {
    // Profissional "principal" é Pintura, mas este lead específico pediu
    // Jardinagem (ex: adquirido no marketplace) — o cálculo tem de usar
    // Jardinagem, nunca Pintura.
    const lead = {
      id: 'lead-5', source: 'marketplace', opened_at: null, locked: false,
      professional_id: 'prof-1', name: 'Cliente',
      specialty: 'Jardinagem',
      metadata: { tipo_trabalho: 'Corte de relva', area_m2: '100' },
      professionals: { specialty: 'Pintura', name: 'Profissional' },
    }
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'leads') return { select: () => ({ eq: () => ({ single: async () => ({ data: lead }) }) }) }
          if (table === 'quotes') return mockQuotesTable()
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-5' }))
    const json = await res.json()

    // Fórmula de Jardinagem foi usada (descrição menciona o tipo de trabalho
    // de jardinagem) — se tivesse usado Pintura por engano, a descrição
    // seria completamente diferente (ou cairia no "Trabalho a orçamentar").
    expect(json.descricao).toContain('Corte de relva')
  })

  it('sem preço do profissional e sem fórmula própria (ex: Pavimentos e Revestimentos): devolve available:false, nunca um intervalo inventado', async () => {
    const lead = {
      id: 'lead-6', source: 'pessoal', opened_at: '2026-07-01T00:00:00Z', locked: false,
      name: 'Cliente', metadata: { tipo_servico: 'Chão flutuante novo', area_m2: '40' },
      professionals: { specialty: 'Pavimentos e Revestimentos', name: 'Profissional' },
    }
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'leads') return { select: () => ({ eq: () => ({ single: async () => ({ data: lead }) }) }) }
          if (table === 'quotes') return mockQuotesTable()
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-6' }))
    const json = await res.json()

    expect(json.available).toBe(false)
    expect(json.quote.valor_min).toBeNull()
    expect(json.quote.valor_max).toBeNull()
    expect(json.quote.valor_final).toBeNull()
    expect(json.quote.proposal_text).toBeNull()
    // Nunca o antigo fallback genérico.
    expect(json.quote.valor_min).not.toBe(100)
    expect(json.quote.valor_max).not.toBe(500)
  })

  it('P1: usa o preço configurado para A ESPECIALIDADE DO LEAD, não a de outra especialidade da mesma conta nem o legacy partilhado', async () => {
    // Profissional tem Pavimentos e Revestimentos (30€/m²) E Remodelação
    // (60€/m²) configurados individualmente — este lead pediu Remodelação,
    // tem de usar 60€/m², nunca os 30€/m² da outra especialidade nem o
    // valor legacy partilhado (10€/m²).
    const lead = {
      id: 'lead-10', source: 'pessoal', opened_at: '2026-07-01T00:00:00Z', locked: false,
      name: 'Cliente', metadata: { area_m2: '20' },
      specialty: 'Remodelação',
      professionals: {
        specialty: 'Pavimentos e Revestimentos', name: 'Profissional',
        price_per_m2: 10, min_quote: 50, // legacy, não deve ser usado
        professional_pricing: [
          { specialty: 'Pavimentos e Revestimentos', price_per_m2: 30, min_quote: 100 },
          { specialty: 'Remodelação', price_per_m2: 60, min_quote: 500 },
        ],
      },
    }
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'leads') return { select: () => ({ eq: () => ({ single: async () => ({ data: lead }) }) }) }
          if (table === 'quotes') return mockQuotesTable()
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-10' }))
    const json = await res.json()

    // 20m² × 60€/m² = 1200€ (acima do min_quote de 500€ da Remodelação)
    expect(json.min).toBe(1200)
  })

  it('P1: subserviço "chão flutuante" identificado pela resposta do cliente (tipo_servico), usa o preço próprio do subserviço, não o geral da especialidade nem o de outro subserviço', async () => {
    const lead = {
      id: 'lead-12', source: 'pessoal', opened_at: '2026-07-01T00:00:00Z', locked: false,
      name: 'Cliente', metadata: { area_m2: '10', tipo_servico: 'Chão flutuante novo' },
      professionals: {
        specialty: 'Pavimentos e Revestimentos', name: 'Profissional',
        price_per_m2: 5, min_quote: 20, // legacy, não deve ser usado
        professional_pricing: [
          { specialty: 'Pavimentos e Revestimentos', price_per_m2: 8, min_quote: 40 }, // linha geral
          { specialty: 'Pavimentos e Revestimentos', subservico: 'chao_flutuante', price_per_m2: 25 },
          { specialty: 'Pavimentos e Revestimentos', subservico: 'remocao_pavimento', price_per_m2: 999 }, // nunca deve ser usado
        ],
      },
    }
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'leads') return { select: () => ({ eq: () => ({ single: async () => ({ data: lead }) }) }) }
          if (table === 'quotes') return mockQuotesTable()
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-12' }))
    const json = await res.json()

    // 10m² × 25€/m² (chao_flutuante) = 250€. Nunca 8€/m² (geral), 5€/m²
    // (legacy) nem 999€/m² (remocao_pavimento).
    expect(json.min).toBe(250)
  })

  it('P1: tipo_servico sem subserviço mapeado (ex: Cerâmica) cai no preço geral da especialidade, não no de chão flutuante', async () => {
    const lead = {
      id: 'lead-13', source: 'pessoal', opened_at: '2026-07-01T00:00:00Z', locked: false,
      name: 'Cliente', metadata: { area_m2: '10', tipo_servico: 'Cerâmica / Porcelânico' },
      professionals: {
        specialty: 'Pavimentos e Revestimentos', name: 'Profissional',
        professional_pricing: [
          { specialty: 'Pavimentos e Revestimentos', price_per_m2: 8, min_quote: 40 }, // linha geral
          { specialty: 'Pavimentos e Revestimentos', subservico: 'chao_flutuante', price_per_m2: 25 }, // nunca deve ser usado aqui
        ],
      },
    }
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'leads') return { select: () => ({ eq: () => ({ single: async () => ({ data: lead }) }) }) }
          if (table === 'quotes') return mockQuotesTable()
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-13' }))
    const json = await res.json()

    // 10m² × 8€/m² (geral) = 80€. Nunca 25€/m² (chao_flutuante).
    expect(json.min).toBe(80)
  })

  it('P1: sem linha em professional_pricing para esta especialidade, cai no legacy partilhado (compatibilidade)', async () => {
    const lead = {
      id: 'lead-11', source: 'pessoal', opened_at: '2026-07-01T00:00:00Z', locked: false,
      name: 'Cliente', metadata: { area_m2: '20' },
      specialty: 'Remodelação',
      professionals: {
        specialty: 'Remodelação', name: 'Profissional',
        price_per_m2: 10, min_quote: 50,
        professional_pricing: [], // ainda sem nenhuma linha configurada
      },
    }
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'leads') return { select: () => ({ eq: () => ({ single: async () => ({ data: lead }) }) }) }
          if (table === 'quotes') return mockQuotesTable()
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-11' }))
    const json = await res.json()

    // 20m² × 10€/m² (legacy) = 200€
    expect(json.min).toBe(200)
  })

  it('recusa recalcular quando a proposta já foi enviada ao cliente (status=enviado)', async () => {
    const lead = {
      id: 'lead-7', source: 'pessoal', opened_at: '2026-07-01T00:00:00Z', locked: false,
      name: 'Cliente', metadata: {}, professionals: { specialty: 'Outro', name: 'Profissional' },
    }
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'leads') return { select: () => ({ eq: () => ({ single: async () => ({ data: lead }) }) }) }
          if (table === 'quotes') return mockQuotesTable({ status: 'enviado', value_source: 'calculated' })
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-7' }))
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json.error).toBe('blocked')
    expect(json.message).toMatch(/enviada/i)
  })

  it('recusa recalcular quando o valor foi editado manualmente (value_source=manual), mesmo em rascunho', async () => {
    const lead = {
      id: 'lead-8', source: 'pessoal', opened_at: '2026-07-01T00:00:00Z', locked: false,
      name: 'Cliente', metadata: {}, professionals: { specialty: 'Outro', name: 'Profissional' },
    }
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'leads') return { select: () => ({ eq: () => ({ single: async () => ({ data: lead }) }) }) }
          if (table === 'quotes') return mockQuotesTable({ status: 'rascunho', value_source: 'manual' })
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-8' }))
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json.error).toBe('blocked')
    expect(json.message).toMatch(/editado manualmente/i)
  })

  it('permite recalcular normalmente quando a quote existente está em rascunho e foi calculada automaticamente', async () => {
    const lead = {
      id: 'lead-9', source: 'pessoal', opened_at: '2026-07-01T00:00:00Z', locked: false,
      name: 'Cliente', metadata: {}, professionals: { specialty: 'Outro', name: 'Profissional' },
    }
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'leads') return { select: () => ({ eq: () => ({ single: async () => ({ data: lead }) }) }) }
          if (table === 'quotes') return mockQuotesTable({ status: 'rascunho', value_source: 'calculated' })
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-9' }))

    expect(res.status).not.toBe(409)
  })
})
