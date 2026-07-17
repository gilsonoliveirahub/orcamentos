import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// lib/marketplace.ts importa @/lib/supabase-admin no topo.
vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: vi.fn() } }))

import { MARKETPLACE_RADIUS_KM } from './marketplace'

// Deslocamento em latitude (graus) que produz exatamente `km` de distância
// Haversine para dois pontos com a mesma longitude — usa a mesma constante
// (raio da Terra = 6371km) que lib/geo.ts, por isso os pontos construídos
// aqui batem certo com o que a implementação calcula.
function kmToLatOffset(km: number): number {
  const R = 6371
  return (km / R) * (180 / Math.PI)
}

const LISBOA = { lat: 38.7223, lng: -9.1393 }

describe('listMarketplaceOpportunities', () => {
  const ORIGINAL_ENV = { ...process.env }
  beforeEach(() => vi.resetModules())
  afterEach(() => { process.env = { ...ORIGINAL_ENV }; vi.restoreAllMocks(); vi.doUnmock('@/lib/supabase-admin') })

  function mockSupabase({ professional, leads }: { professional: Record<string, unknown>; leads: Record<string, unknown>[] }) {
    const from = vi.fn((table: string) => {
      if (table === 'professionals') return { select: () => ({ eq: () => ({ single: async () => ({ data: professional }) }) }) }
      if (table === 'leads') {
        return {
          select: () => ({
            is: () => ({
              eq: () => ({
                in: () => ({ order: async () => ({ data: leads }) }),
              }),
            }),
          }),
        }
      }
      throw new Error(`tabela inesperada: ${table}`)
    })
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))
  }

  it('a distância exatamente 50km fica incluída (limite inclusivo)', async () => {
    const professional = { specialty: 'Pintura', specialties: [], zone: 'Lisboa' }
    const leadAt50km = {
      id: 'lead-50',
      specialty: 'Pintura',
      zone_requested: 'algures',
      created_at: '2026-07-16T00:00:00Z',
      lat: LISBOA.lat + kmToLatOffset(50),
      lng: LISBOA.lng,
    }
    mockSupabase({ professional, leads: [leadAt50km] })

    const { listMarketplaceOpportunities } = await import('./marketplace')
    const result = await listMarketplaceOpportunities('prof-1')

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('lead-50')
    expect(result[0].distance_km).toBeCloseTo(50, 1)
  })

  it('a distância pouco acima de 50km fica excluída', async () => {
    const professional = { specialty: 'Pintura', specialties: [], zone: 'Lisboa' }
    const leadJustOver = {
      id: 'lead-over',
      specialty: 'Pintura',
      zone_requested: 'algures',
      created_at: '2026-07-16T00:00:00Z',
      lat: LISBOA.lat + kmToLatOffset(50.5),
      lng: LISBOA.lng,
    }
    mockSupabase({ professional, leads: [leadJustOver] })

    const { listMarketplaceOpportunities } = await import('./marketplace')
    const result = await listMarketplaceOpportunities('prof-1')

    expect(result).toHaveLength(0)
  })

  it('a distância claramente dentro de 50km fica incluída', async () => {
    const professional = { specialty: 'Pintura', specialties: [], zone: 'Lisboa' }
    const leadClose = {
      id: 'lead-close',
      specialty: 'Pintura',
      zone_requested: 'algures',
      created_at: '2026-07-16T00:00:00Z',
      lat: LISBOA.lat + kmToLatOffset(18),
      lng: LISBOA.lng,
    }
    mockSupabase({ professional, leads: [leadClose] })

    const { listMarketplaceOpportunities } = await import('./marketplace')
    const result = await listMarketplaceOpportunities('prof-1')

    expect(result).toHaveLength(1)
    expect(result[0].distance_label).toBe('aproximadamente 18 km')
  })

  it('sem coordenadas dos dois lados: mantém visível com "distância indisponível" (nunca perde leads antigos)', async () => {
    const professional = { specialty: 'Pintura', specialties: [], zone: 'Zona Desconhecida XYZ' } // não reconhecida
    const leadWithoutCoords = {
      id: 'lead-old',
      specialty: 'Pintura',
      zone_requested: 'Outra localidade não reconhecida',
      created_at: '2026-07-16T00:00:00Z',
      lat: null,
      lng: null,
    }
    mockSupabase({ professional, leads: [leadWithoutCoords] })

    const { listMarketplaceOpportunities } = await import('./marketplace')
    const result = await listMarketplaceOpportunities('prof-1')

    expect(result).toHaveLength(1)
    expect(result[0].distance_km).toBeNull()
    expect(result[0].distance_label).toBe('distância indisponível')
  })

  it('usa specialties[] quando definido, cai para specialty singular quando o array está vazio', async () => {
    const professionalWithArray = { specialty: 'Pintura', specialties: ['Canalização', 'Eletricidade'], zone: 'Lisboa' }
    const leads = [{ id: 'lead-1', specialty: 'Canalização', zone_requested: 'Lisboa', created_at: '2026-07-16T00:00:00Z', lat: LISBOA.lat, lng: LISBOA.lng }]
    mockSupabase({ professional: professionalWithArray, leads })

    const { listMarketplaceOpportunities } = await import('./marketplace')
    const result = await listMarketplaceOpportunities('prof-1')
    expect(result).toHaveLength(1)
  })

  it('nunca devolve dados pessoais do cliente — só o resumo', async () => {
    const professional = { specialty: 'Pintura', specialties: [], zone: 'Lisboa' }
    const leads = [{ id: 'lead-1', specialty: 'Pintura', zone_requested: 'Lisboa', created_at: '2026-07-16T00:00:00Z', lat: LISBOA.lat, lng: LISBOA.lng }]
    mockSupabase({ professional, leads })

    const { listMarketplaceOpportunities } = await import('./marketplace')
    const result = await listMarketplaceOpportunities('prof-1')
    const keys = Object.keys(result[0])
    expect(keys).not.toContain('name')
    expect(keys).not.toContain('phone')
    expect(keys).not.toContain('email')
    expect(keys.sort()).toEqual(['created_at', 'distance_km', 'distance_label', 'id', 'specialty', 'zone_requested'].sort())
  })

  it('sem especialidade nenhuma definida, devolve lista vazia sem tentar consultar leads', async () => {
    const professional = { specialty: null, specialties: [], zone: 'Lisboa' }
    const from = vi.fn((table: string) => {
      if (table === 'professionals') return { select: () => ({ eq: () => ({ single: async () => ({ data: professional }) }) }) }
      throw new Error(`tabela inesperada: ${table}`) // 'leads' nunca deveria ser consultada
    })
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))

    const { listMarketplaceOpportunities } = await import('./marketplace')
    const result = await listMarketplaceOpportunities('prof-1')
    expect(result).toEqual([])
  })
})

describe('acquireMarketplaceLead', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => { vi.restoreAllMocks(); vi.doUnmock('@/lib/supabase-admin'); vi.unstubAllGlobals() })

  // Tudo (plano, crédito, especialidade, raio, desconto e associação) é
  // decidido dentro da função SQL acquire_marketplace_lead(), numa única
  // transação — a lib só lê a zona do profissional (para geocodificar) e
  // reencaminha o resultado da RPC. Ver supabase/migration_marketplace_v3_atomic.sql.
  function mockZoneAndRpc(zone: string | null, rpcResult: { data: unknown; error?: unknown }) {
    const from = vi.fn((table: string) => {
      if (table === 'professionals') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { zone } }) }) }) }
      throw new Error(`tabela inesperada: ${table}`)
    })
    const rpc = vi.fn().mockResolvedValue(rpcResult)
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from, rpc } }))
    return rpc
  }

  it('bloqueia plano Free', async () => {
    mockZoneAndRpc('Lisboa', { data: { ok: false, error: 'plan' } })
    const { acquireMarketplaceLead } = await import('./marketplace')
    const result = await acquireMarketplaceLead({ leadId: 'lead-1', professionalId: 'prof-1' })
    expect(result).toEqual({ ok: false, error: 'plan' })
  })

  it('bloqueia sem créditos suficientes', async () => {
    mockZoneAndRpc('Lisboa', { data: { ok: false, error: 'credits' } })
    const { acquireMarketplaceLead } = await import('./marketplace')
    const result = await acquireMarketplaceLead({ leadId: 'lead-1', professionalId: 'prof-1' })
    expect(result).toEqual({ ok: false, error: 'credits' })
  })

  it('bloqueia especialidade incompatível (chamada direta à API, fora da listagem já filtrada)', async () => {
    mockZoneAndRpc('Lisboa', { data: { ok: false, error: 'specialty' } })
    const { acquireMarketplaceLead } = await import('./marketplace')
    const result = await acquireMarketplaceLead({ leadId: 'lead-1', professionalId: 'prof-1' })
    expect(result).toEqual({ ok: false, error: 'specialty' })
  })

  it('bloqueia fora do raio de 50km (chamada direta à API, fora da listagem já filtrada)', async () => {
    mockZoneAndRpc('Lisboa', { data: { ok: false, error: 'out_of_range' } })
    const { acquireMarketplaceLead } = await import('./marketplace')
    const result = await acquireMarketplaceLead({ leadId: 'lead-1', professionalId: 'prof-1' })
    expect(result).toEqual({ ok: false, error: 'out_of_range' })
  })

  it('devolve not_found quando o profissional não existe', async () => {
    const from = vi.fn((table: string) => {
      if (table === 'professionals') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }
      throw new Error(`tabela inesperada: ${table}`)
    })
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from, rpc: vi.fn() } }))

    const { acquireMarketplaceLead } = await import('./marketplace')
    const result = await acquireMarketplaceLead({ leadId: 'lead-1', professionalId: 'prof-1' })
    expect(result).toEqual({ ok: false, error: 'not_found' })
  })

  it('erro de rede/RPC devolve not_found em vez de rebentar', async () => {
    mockZoneAndRpc('Lisboa', { data: null, error: { message: 'falha de ligação' } })
    const { acquireMarketplaceLead } = await import('./marketplace')
    const result = await acquireMarketplaceLead({ leadId: 'lead-1', professionalId: 'prof-1' })
    expect(result).toEqual({ ok: false, error: 'not_found' })
  })

  it('aquisição com sucesso: passa as coordenadas do profissional (calculadas a partir da zona na BD) e dispara notificação', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
    const rpc = mockZoneAndRpc('Lisboa', { data: { ok: true } })

    const { acquireMarketplaceLead, MARKETPLACE_RADIUS_KM } = await import('./marketplace')
    const result = await acquireMarketplaceLead({ leadId: 'lead-1', professionalId: 'prof-1' })

    expect(result).toEqual({ ok: true, leadId: 'lead-1' })
    expect(rpc).toHaveBeenCalledWith('acquire_marketplace_lead', {
      p_lead_id: 'lead-1',
      p_professional_id: 'prof-1',
      p_radius_km: MARKETPLACE_RADIUS_KM,
      p_prof_lat: expect.closeTo(38.7223, 2),
      p_prof_lng: expect.closeTo(-9.1393, 2),
    })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain('/api/notifications/lead')
  })

  it('zona do profissional não reconhecida: passa lat/lng null à RPC (fallback tratado lá dentro)', async () => {
    const rpc = mockZoneAndRpc('Zona Desconhecida XYZ', { data: { ok: true } })
    const { acquireMarketplaceLead } = await import('./marketplace')
    await acquireMarketplaceLead({ leadId: 'lead-1', professionalId: 'prof-1' })

    expect(rpc).toHaveBeenCalledWith('acquire_marketplace_lead', expect.objectContaining({ p_prof_lat: null, p_prof_lng: null }))
  })

  it('perde a corrida (lead já adquirido por outro): não descontou nada nem notifica — não há reembolso porque nunca houve cobrança', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
    mockZoneAndRpc('Lisboa', { data: { ok: false, error: 'taken' } })

    const { acquireMarketplaceLead } = await import('./marketplace')
    const result = await acquireMarketplaceLead({ leadId: 'lead-1', professionalId: 'prof-1' })

    expect(result).toEqual({ ok: false, error: 'taken' })
    expect(fetch).not.toHaveBeenCalled() // não notifica uma aquisição que falhou
  })

  it('concorrência: duas aquisições simultâneas do mesmo lead — só uma ganha, a outra nunca perde crédito', async () => {
    // Simula o bloqueio de linha (FOR UPDATE) da função SQL acquire_marketplace_lead:
    // um "await" artificial antes da secção crítica força as duas chamadas a
    // chegarem ao ponto de decisão antes de qualquer uma escrever, mas a
    // decisão em si (ler leadOwner, só depois escrever) corre sem mais nenhum
    // yield — tal como a transação real do Postgres serializa por baixo.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
    let leadOwner: string | null = null
    const creditsByProf: Record<string, number> = { 'prof-a': 3, 'prof-b': 3 }

    const from = vi.fn((table: string) => {
      if (table === 'professionals') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { zone: 'Lisboa' } }) }) }) }
      throw new Error(`tabela inesperada: ${table}`)
    })
    const rpc = vi.fn(async (_fn: string, args: { p_professional_id: string }) => {
      await Promise.resolve() // ponto de interleaving — as duas chamadas passam por aqui antes de decidir
      if (leadOwner) return { data: { ok: false, error: 'taken' } }
      if ((creditsByProf[args.p_professional_id] ?? 0) < 1) return { data: { ok: false, error: 'credits' } }
      leadOwner = args.p_professional_id
      creditsByProf[args.p_professional_id] -= 1
      return { data: { ok: true } }
    })
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from, rpc } }))

    const { acquireMarketplaceLead } = await import('./marketplace')
    const [resultA, resultB] = await Promise.all([
      acquireMarketplaceLead({ leadId: 'lead-1', professionalId: 'prof-a' }),
      acquireMarketplaceLead({ leadId: 'lead-1', professionalId: 'prof-b' }),
    ])

    const outcomes = [resultA, resultB]
    expect(outcomes.filter(r => r.ok)).toHaveLength(1)
    const loser = outcomes.find(r => !r.ok) as { ok: false; error: string }
    expect(loser.error).toBe('taken')
    // Só o vencedor perdeu crédito — o perdedor mantém os 3 créditos originais.
    expect(Object.values(creditsByProf).sort()).toEqual([2, 3])
  })
})

describe('MARKETPLACE_RADIUS_KM', () => {
  it('está definido como 50km', () => {
    expect(MARKETPLACE_RADIUS_KM).toBe(50)
  })
})
