import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

function fakeRequest(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest
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
