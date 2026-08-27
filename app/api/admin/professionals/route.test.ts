import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'

function fakeRequest(query: string): NextRequest {
  return { url: `https://façoporti.com/api/admin/professionals${query}` } as unknown as NextRequest
}

function chainable(result: unknown) {
  const obj: Record<string, unknown> = {
    select: () => obj,
    not: () => obj,
    then: (resolve: (v: unknown) => void) => resolve(result),
  }
  return obj
}

describe('GET /api/admin/professionals', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => { vi.restoreAllMocks(); vi.doUnmock('@/lib/admin-auth'); vi.doUnmock('@/lib/supabase-admin') })

  const professionals = [
    { id: 'p-free', name: 'Ana Free', email: 'ana@x.com', phone: null, specialty: 'Pintura', specialties: ['Pintura'], zone: 'Lisboa', active: true, slug: 'ana', plan: 'free', trial_ends_at: null, created_at: '2020-01-01T00:00:00Z' },
    { id: 'p-trial', name: 'Bruno Trial', email: 'bruno@x.com', phone: null, specialty: 'Jardinagem', specialties: [], zone: 'Porto', active: true, slug: 'bruno', plan: 'free', trial_ends_at: '2099-01-01T00:00:00Z', created_at: '2021-01-01T00:00:00Z' },
    { id: 'p-pro-inactive', name: 'Carla Pro', email: 'carla@x.com', phone: null, specialty: 'Pintura', specialties: [], zone: 'Faro', active: false, slug: 'carla', plan: 'pro', trial_ends_at: null, created_at: '2022-01-01T00:00:00Z' },
    { id: 'p-trial-soon', name: 'Duarte Trial', email: 'duarte@x.com', phone: null, specialty: 'Pintura', specialties: [], zone: 'Braga', active: true, slug: 'duarte', plan: 'free', trial_ends_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(), created_at: '2023-01-01T00:00:00Z' },
  ]
  const leads = [
    { professional_id: 'p-free', status: 'novo' },
    { professional_id: 'p-free', status: 'fechado' },
    { professional_id: 'p-pro-inactive', status: 'novo' },
  ]

  function mockDeps({ isAdmin = true } = {}) {
    vi.doMock('@/lib/admin-auth', () => ({ getAuthenticatedAdmin: async () => (isAdmin ? { id: 'admin-1' } : null) }))
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: (table: string) => {
          if (table === 'professionals') return chainable({ data: professionals, error: null })
          if (table === 'leads') return chainable({ data: leads, error: null })
          throw new Error(`tabela inesperada: ${table}`)
        },
      },
    }))
  }

  it('bloqueia quem não é admin', async () => {
    mockDeps({ isAdmin: false })
    const { GET } = await import('./route')
    const res = await GET(fakeRequest(''))
    expect(res.status).toBe(403)
  })

  it('devolve todos os profissionais com plano efetivo administrativo e contagem de leads ativos', async () => {
    mockDeps()
    const { GET } = await import('./route')
    const res = await GET(fakeRequest(''))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.professionals).toHaveLength(4)
    const bruno = json.professionals.find((p: { id: string }) => p.id === 'p-trial')
    expect(bruno.effective_plan).toBe('trial') // distingue de 'starter', ao contrário do gate de permissões
    const ana = json.professionals.find((p: { id: string }) => p.id === 'p-free')
    expect(ana.active_leads_count).toBe(1) // só o 'novo' conta, o 'fechado' não
  })

  it('filtra por plano efetivo (trial != starter)', async () => {
    mockDeps()
    const { GET } = await import('./route')
    const res = await GET(fakeRequest('?plan=trial'))
    const json = await res.json()
    expect(json.professionals.map((p: { id: string }) => p.id).sort()).toEqual(['p-trial', 'p-trial-soon'])
  })

  it('filtra por estado ativo/inativo', async () => {
    mockDeps()
    const { GET } = await import('./route')
    const res = await GET(fakeRequest('?active=false'))
    const json = await res.json()
    expect(json.professionals.map((p: { id: string }) => p.id)).toEqual(['p-pro-inactive'])
  })

  it('pesquisa por nome ou email (case-insensitive)', async () => {
    mockDeps()
    const { GET } = await import('./route')
    const res = await GET(fakeRequest('?q=CARLA'))
    const json = await res.json()
    expect(json.professionals.map((p: { id: string }) => p.id)).toEqual(['p-pro-inactive'])
  })

  it('filtra por trials a terminar em breve (expiring_soon) — só o trial com menos de 7 dias', async () => {
    mockDeps()
    const { GET } = await import('./route')
    const res = await GET(fakeRequest('?expiring_soon=true'))
    const json = await res.json()
    // p-trial tem trial_ends_at em 2099 — muito longe, não deve aparecer
    expect(json.professionals.map((p: { id: string }) => p.id)).toEqual(['p-trial-soon'])
  })

  it('filtra por especialidade e por zona (substring)', async () => {
    mockDeps()
    const { GET } = await import('./route')
    const resSpec = await GET(fakeRequest('?specialty=Jardinagem'))
    expect((await resSpec.json()).professionals.map((p: { id: string }) => p.id)).toEqual(['p-trial'])

    const resZone = await GET(fakeRequest('?zone=lis'))
    expect((await resZone.json()).professionals.map((p: { id: string }) => p.id)).toEqual(['p-free'])
  })
})
