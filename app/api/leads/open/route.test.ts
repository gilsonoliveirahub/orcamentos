import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

function fakeRequest(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest
}

function mockAuth(userId: string | null) {
  vi.doMock('next/headers', () => ({ cookies: async () => ({ getAll: () => [] }) }))
  vi.doMock('@supabase/ssr', () => ({
    createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null } }) } }),
  }))
}

describe('POST /api/leads/open', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => {
    vi.restoreAllMocks()
    vi.doUnmock('@/lib/supabase-admin')
    vi.doUnmock('@supabase/ssr')
    vi.doUnmock('next/headers')
    vi.doUnmock('@/lib/personal-link-limits')
  })

  it('bloqueia quem não está autenticado, sem tentar abrir nada', async () => {
    mockAuth(null)
    const openPersonalLead = vi.fn()
    vi.doMock('@/lib/personal-link-limits', () => ({ openPersonalLead }))
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: vi.fn() } }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1' }))
    expect(res.status).toBe(403)
    expect(openPersonalLead).not.toHaveBeenCalled()
  })

  it('lead de outro profissional (ou inexistente): 404, nunca chega a tentar abrir nem a buscar dados', async () => {
    mockAuth('user-1')
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'professionals') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1' } }) }) }) }
          if (table === 'leads') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'lead-1', professional_id: 'outro-prof' } }) }) }) }
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))
    const openPersonalLead = vi.fn()
    vi.doMock('@/lib/personal-link-limits', () => ({ openPersonalLead }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1' }))
    expect(res.status).toBe(404)
    expect(openPersonalLead).not.toHaveBeenCalled()
  })

  it('lead do link pessoal ainda não aberto: tenta abrir; se a quota bloquear, devolve 403 sem dados', async () => {
    mockAuth('user-1')
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'professionals') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1' } }) }) }) }
          if (table === 'leads') {
            return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'lead-1', professional_id: 'prof-1', source: 'pessoal', opened_at: null, locked: false } }) }) }) }
          }
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))
    vi.doMock('@/lib/personal-link-limits', () => ({ openPersonalLead: vi.fn().mockResolvedValue({ ok: false, error: 'quota' }) }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1' }))
    const json = await res.json()
    expect(res.status).toBe(403)
    expect(json.reason).toBe('quota')
    expect(json.lead).toBeUndefined()
  })

  it('abertura autorizada: devolve lead e quote completos, buscados só depois da confirmação', async () => {
    mockAuth('user-1')
    let leadsCallCount = 0
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'professionals') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1' } }) }) }) }
          if (table === 'leads') {
            leadsCallCount += 1
            if (leadsCallCount === 1) {
              return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'lead-1', professional_id: 'prof-1', source: 'pessoal', opened_at: null, locked: false } }) }) }) }
            }
            if (leadsCallCount === 2) {
              return { select: () => ({ eq: () => ({ single: async () => ({ data: { opened_at: '2026-07-17T00:00:00Z', source: 'pessoal', locked: false } }) }) }) }
            }
            return { select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'lead-1', name: 'Cliente Real', phone: '351911111111' } }) }) }) }
          }
          if (table === 'quotes') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))
    vi.doMock('@/lib/personal-link-limits', () => ({ openPersonalLead: vi.fn().mockResolvedValue({ ok: true, alreadyOpen: false }) }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1' }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.ok).toBe(true)
    expect(json.lead.name).toBe('Cliente Real')
    expect(json.quote).toBeNull()
  })

  it('lead manual (source: null, opened_at já preenchido na criação): profissional Free consegue abrir sem passar por openPersonalLead nem pela quota', async () => {
    mockAuth('user-1')
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'professionals') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1' } }) }) }) }
          if (table === 'leads') {
            // opened_at já vem preenchido desde a criação (ver /api/leads/create)
            // — nunca chega a precisar de consultar o plano do profissional.
            const row = { id: 'lead-1', professional_id: 'prof-1', source: null, opened_at: '2026-08-25T10:00:00Z', locked: false }
            return {
              select: () => ({ eq: () => ({
                maybeSingle: async () => ({ data: row }),
                single: async () => ({ data: { ...row, name: 'Cliente Manual', phone: '351900000000' } }),
              }) }),
            }
          }
          if (table === 'quotes') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))
    const openPersonalLead = vi.fn()
    vi.doMock('@/lib/personal-link-limits', () => ({ openPersonalLead }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.lead.name).toBe('Cliente Manual')
    // Nunca tenta abrir (já estava aberto desde a criação) — por isso um
    // profissional Free (que teria 'plan' bloqueado num lead do link
    // pessoal real) consegue sempre ver o lead que ele próprio inseriu.
    expect(openPersonalLead).not.toHaveBeenCalled()
  })

  it('contraste — lead REAL do link pessoal (source: pessoal, ainda não aberto): profissional Free continua bloqueado (\'plan\'), a quota nunca é contornada', async () => {
    mockAuth('user-1')
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'professionals') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1' } }) }) }) }
          if (table === 'leads') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'lead-1', professional_id: 'prof-1', source: 'pessoal', opened_at: null, locked: false } }) }) }) }
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))
    vi.doMock('@/lib/personal-link-limits', () => ({ openPersonalLead: vi.fn().mockResolvedValue({ ok: false, error: 'plan' }) }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1' }))
    const json = await res.json()

    expect(res.status).toBe(403)
    expect(json.reason).toBe('plan')
    expect(json.lead).toBeUndefined()
  })

  it('profissional inactive com lead do marketplace já adquirido antes (locked=false): continua a ver os dados completos, mesmo sem plano pago atual', async () => {
    mockAuth('user-1')
    let leadsCallCount = 0
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          // Esta rota nunca consulta professionals.plan — a autorização de
          // um lead já adquirido depende só de locked=false (ver
          // lib/lead-authorization.ts), nunca do plano atual do profissional.
          // Um 'inactive' que já pagou para adquirir este lead no passado
          // continua a poder vê-lo, consultar contactos e geri-lo.
          if (table === 'professionals') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1' } }) }) }) }
          if (table === 'leads') {
            leadsCallCount += 1
            const row = { id: 'lead-1', professional_id: 'prof-1', source: 'marketplace', opened_at: null, locked: false }
            if (leadsCallCount === 1) return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }) }
            if (leadsCallCount === 2) return { select: () => ({ eq: () => ({ single: async () => ({ data: row }) }) }) }
            return { select: () => ({ eq: () => ({ single: async () => ({ data: { ...row, name: 'Cliente Adquirido Antes', phone: '351911112222' } }) }) }) }
          }
          if (table === 'quotes') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))
    const openPersonalLead = vi.fn()
    vi.doMock('@/lib/personal-link-limits', () => ({ openPersonalLead }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.lead.name).toBe('Cliente Adquirido Antes')
    expect(openPersonalLead).not.toHaveBeenCalled()
  })

  it('lead do marketplace ainda bloqueado (locked=true): não tenta abrir, devolve 403 sem dados', async () => {
    mockAuth('user-1')
    let leadsCallCount = 0
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'professionals') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'prof-1' } }) }) }) }
          if (table === 'leads') {
            leadsCallCount += 1
            const row = { id: 'lead-1', professional_id: 'prof-1', source: 'marketplace', opened_at: null, locked: true }
            if (leadsCallCount === 1) return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }) }
            return { select: () => ({ eq: () => ({ single: async () => ({ data: row }) }) }) }
          }
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))
    const openPersonalLead = vi.fn()
    vi.doMock('@/lib/personal-link-limits', () => ({ openPersonalLead }))

    const { POST } = await import('./route')
    const res = await POST(fakeRequest({ lead_id: 'lead-1' }))
    expect(res.status).toBe(403)
    expect(openPersonalLead).not.toHaveBeenCalled()
  })
})
