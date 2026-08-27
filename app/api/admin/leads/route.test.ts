import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

function fakeRequest(query: string): NextRequest {
  return { url: `https://façoporti.com/api/admin/leads${query}` } as unknown as NextRequest
}

function chainable(result: unknown) {
  const obj: Record<string, unknown> = {
    select: () => obj,
    order: () => obj,
    gte: () => obj,
    lte: () => obj,
    eq: () => obj,
    then: (resolve: (v: unknown) => void) => resolve(result),
  }
  return obj
}

const now = new Date()
const oldDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString() // 60 dias atrás

const leads = [
  { id: 'l-aberto', name: 'Cliente A', phone: '111', email: null, status: 'novo', source: 'pessoal', specialty: 'Pintura', zone_requested: 'Lisboa', professional_id: 'p1', created_at: now.toISOString(), opened_at: now.toISOString(), locked: null, valor_fechado: null, professionals: { name: 'Ana', specialty: 'Pintura', zone: 'Lisboa' } },
  { id: 'l-bloqueado', name: 'Cliente B', phone: '222', email: null, status: 'novo', source: 'pessoal', specialty: 'Pintura', zone_requested: 'Porto', professional_id: 'p1', created_at: oldDate, opened_at: null, locked: null, valor_fechado: null, professionals: { name: 'Ana', specialty: 'Pintura', zone: 'Lisboa' } },
  { id: 'l-disponivel', name: 'Cliente C', phone: '333', email: 'c@x.com', status: 'novo', source: 'marketplace', specialty: 'Jardinagem', zone_requested: 'Faro', professional_id: null, created_at: now.toISOString(), opened_at: null, locked: true, valor_fechado: null, professionals: null },
  { id: 'l-adquirido', name: 'Cliente D', phone: '444', email: null, status: 'fechado', source: 'marketplace', specialty: 'Jardinagem', zone_requested: 'Faro', professional_id: 'p2', created_at: now.toISOString(), opened_at: null, locked: false, valor_fechado: 400, professionals: { name: 'Bruno', specialty: 'Jardinagem', zone: 'Faro' } },
]

describe('GET /api/admin/leads', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => { vi.restoreAllMocks(); vi.doUnmock('@/lib/admin-auth'); vi.doUnmock('@/lib/supabase-admin') })

  function mockDeps({ isAdmin = true } = {}) {
    vi.doMock('@/lib/admin-auth', () => ({ getAuthenticatedAdmin: async () => (isAdmin ? { id: 'admin-1' } : null) }))
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: { from: (table: string) => {
        if (table === 'leads') return chainable({ data: leads, error: null })
        throw new Error(`tabela inesperada: ${table}`)
      } },
    }))
  }

  it('bloqueia quem não é admin', async () => {
    mockDeps({ isAdmin: false })
    const { GET } = await import('./route')
    const res = await GET(fakeRequest(''))
    expect(res.status).toBe(403)
  })

  it('devolve todos os leads com access_state e abandoned derivados', async () => {
    mockDeps()
    const { GET } = await import('./route')
    const res = await GET(fakeRequest(''))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.leads).toHaveLength(4)
    const byId = Object.fromEntries(json.leads.map((l: { id: string }) => [l.id, l]))
    expect(byId['l-aberto'].access_state).toBe('aberto')
    expect(byId['l-bloqueado'].access_state).toBe('bloqueado')
    expect(byId['l-disponivel'].access_state).toBe('disponivel')
    expect(byId['l-adquirido'].access_state).toBe('adquirido')
    expect(byId['l-bloqueado'].abandoned).toBe(true) // 'novo' há 60 dias
    expect(byId['l-aberto'].abandoned).toBe(false)
  })

  it('filtra por access_state', async () => {
    mockDeps()
    const { GET } = await import('./route')
    const res = await GET(fakeRequest('?access_state=disponivel'))
    const json = await res.json()
    expect(json.leads.map((l: { id: string }) => l.id)).toEqual(['l-disponivel'])
  })

  it('filtra só abandonados', async () => {
    mockDeps()
    const { GET } = await import('./route')
    const res = await GET(fakeRequest('?abandoned=true'))
    const json = await res.json()
    expect(json.leads.map((l: { id: string }) => l.id)).toEqual(['l-bloqueado'])
  })

  it('status com vírgula usa .in() com a lista; um único estado usa .eq()', async () => {
    const calls: Array<{ method: string; args: unknown[] }> = []
    vi.doMock('@/lib/admin-auth', () => ({ getAuthenticatedAdmin: async () => ({ id: 'admin-1' }) }))
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: () => {
          const obj: Record<string, unknown> = {
            select: () => obj,
            order: () => obj,
            eq: (...args: unknown[]) => { calls.push({ method: 'eq', args }); return obj },
            in: (...args: unknown[]) => { calls.push({ method: 'in', args }); return obj },
            then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
          }
          return obj
        },
      },
    }))

    const { GET } = await import('./route')
    await GET(fakeRequest('?status=qualificado,visita'))
    expect(calls).toContainEqual({ method: 'in', args: ['status', ['qualificado', 'visita']] })

    calls.length = 0
    await GET(fakeRequest('?status=fechado'))
    expect(calls).toContainEqual({ method: 'eq', args: ['status', 'fechado'] })
  })

  it('filtra por zona (substring) e por pesquisa nome/telefone/email', async () => {
    mockDeps()
    const { GET } = await import('./route')
    const resZone = await GET(fakeRequest('?zone=fa'))
    expect((await resZone.json()).leads.map((l: { id: string }) => l.id).sort()).toEqual(['l-adquirido', 'l-disponivel'])

    const resQ = await GET(fakeRequest('?q=c@x.com'))
    expect((await resQ.json()).leads.map((l: { id: string }) => l.id)).toEqual(['l-disponivel'])
  })
})
