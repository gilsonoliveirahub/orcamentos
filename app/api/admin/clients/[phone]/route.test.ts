import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

function fakeParams(phone: string) {
  return { params: Promise.resolve({ phone }) }
}

const leadsForPhone = [
  { id: 'l1', phone: '351911111111', name: 'Ana Cliente', email: 'ana@x.com', status: 'fechado', source: 'pessoal', specialty: 'Pintura', zone_requested: 'Lisboa', valor_fechado: 300, created_at: '2026-02-01T00:00:00Z', opened_at: '2026-02-01T01:00:00Z', professional_id: 'p1', professionals: { id: 'p1', name: 'Prof A', specialty: 'Pintura', zone: 'Lisboa', slug: 'prof-a' } },
  { id: 'l2', phone: '351911111111', name: 'Ana Cliente', email: 'ana@x.com', status: 'perdido', source: 'pessoal', specialty: 'Pintura', zone_requested: 'Lisboa', valor_fechado: null, created_at: '2026-01-01T00:00:00Z', opened_at: null, professional_id: 'p1', professionals: { id: 'p1', name: 'Prof A', specialty: 'Pintura', zone: 'Lisboa', slug: 'prof-a' } },
]

describe('GET /api/admin/clients/[phone]', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => { vi.restoreAllMocks(); vi.doUnmock('@/lib/admin-auth'); vi.doUnmock('@/lib/supabase-admin') })

  function mockDeps({ isAdmin = true, leadsData = leadsForPhone }: { isAdmin?: boolean; leadsData?: unknown[] } = {}) {
    vi.doMock('@/lib/admin-auth', () => ({ getAuthenticatedAdmin: async () => (isAdmin ? { id: 'admin-1' } : null) }))
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'leads') return { select: () => ({ eq: () => ({ order: async () => ({ data: leadsData, error: null }) }) }) }
          if (table === 'clients') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))
  }

  it('bloqueia quem não é admin', async () => {
    mockDeps({ isAdmin: false })
    const { GET } = await import('./route')
    const res = await GET({} as unknown as NextRequest, fakeParams('351911111111'))
    expect(res.status).toBe(403)
  })

  it('devolve 404 se não houver nenhum lead com esse telefone', async () => {
    mockDeps({ leadsData: [] })
    const { GET } = await import('./route')
    const res = await GET({} as unknown as NextRequest, fakeParams('000'))
    expect(res.status).toBe(404)
  })

  it('devolve resumo do cliente + histórico completo de pedidos com access_state', async () => {
    mockDeps()
    const { GET } = await import('./route')
    const res = await GET({} as unknown as NextRequest, fakeParams('351911111111'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.client.phone).toBe('351911111111')
    expect(json.client.leadsCount).toBe(2)
    expect(json.client.fechadosCount).toBe(1)
    expect(json.client.valorFechadoTotal).toBe(300)
    expect(json.leads).toHaveLength(2)
    expect(json.leads[0].access_state).toBe('aberto')
    expect(json.leads[1].access_state).toBe('bloqueado')
    expect(json.account).toBeNull()
  })
})
