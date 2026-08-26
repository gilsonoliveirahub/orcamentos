import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

function fakeRequest(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest
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
          if (table === 'quotes') return { upsert: () => ({ select: () => ({ single: async () => ({ data: { id: 'quote-1' } }) }) }) }
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-3' }))

    expect(res.status).not.toBe(403)
  })

  it('nunca inclui as URLs de fotos/vídeo em bruto no texto da proposta enviada ao cliente', async () => {
    const lead = {
      id: 'lead-4', source: 'pessoal', opened_at: '2026-07-01T00:00:00Z', locked: false,
      name: 'Cliente Autorizado',
      metadata: { tipo_trabalho: 'Pintura interior', media_urls: ['https://x/1.jpg', 'https://x/2.jpg'] },
      professionals: { specialty: 'Outro', name: 'Profissional' },
    }
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'leads') return { select: () => ({ eq: () => ({ single: async () => ({ data: lead }) }) }) }
          if (table === 'quotes') return { upsert: () => ({ select: () => ({ single: async () => ({ data: { id: 'quote-1' } }) }) }) }
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
})
