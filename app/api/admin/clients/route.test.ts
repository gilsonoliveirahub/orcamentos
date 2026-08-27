import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

function fakeRequest(query: string): NextRequest {
  return { url: `https://façoporti.com/api/admin/clients${query}` } as unknown as NextRequest
}

const leads = [
  { id: 'l1', phone: '111', name: 'Ana Cliente', email: 'ana@x.com', status: 'fechado', source: 'pessoal', valor_fechado: 300, created_at: '2026-01-01T00:00:00Z', professional_id: 'p1', professionals: { name: 'Prof A' } },
  { id: 'l2', phone: '222', name: 'Bruno Cliente', email: null, status: 'novo', source: 'marketplace', valor_fechado: null, created_at: '2026-02-01T00:00:00Z', professional_id: null, professionals: null },
]

describe('GET /api/admin/clients', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => { vi.restoreAllMocks(); vi.doUnmock('@/lib/admin-auth'); vi.doUnmock('@/lib/supabase-admin') })

  function mockDeps({ isAdmin = true } = {}) {
    vi.doMock('@/lib/admin-auth', () => ({ getAuthenticatedAdmin: async () => (isAdmin ? { id: 'admin-1' } : null) }))
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: { from: (table: string) => {
        if (table === 'leads') return { select: async () => ({ data: leads, error: null }) }
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

  it('agrupa leads por telefone em clientes', async () => {
    mockDeps()
    const { GET } = await import('./route')
    const res = await GET(fakeRequest(''))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.clients).toHaveLength(2)
  })

  it('pesquisa por nome/telefone/email', async () => {
    mockDeps()
    const { GET } = await import('./route')
    const res = await GET(fakeRequest('?q=bruno'))
    const json = await res.json()
    expect(json.clients.map((c: { phone: string }) => c.phone)).toEqual(['222'])
  })
})
