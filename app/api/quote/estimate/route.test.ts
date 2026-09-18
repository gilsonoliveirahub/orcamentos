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
