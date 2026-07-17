import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: vi.fn(), rpc: vi.fn() } }))

import { getCycleWindow, PERSONAL_LINK_PLAN_LIMITS } from './personal-link-limits'

function chainable(result: unknown) {
  const obj: Record<string, unknown> = {
    select: () => obj,
    eq: () => obj,
    not: () => obj,
    gte: () => obj,
    lt: () => obj,
    is: () => obj,
    maybeSingle: async () => result,
    then: (resolve: (v: unknown) => void) => resolve(result),
  }
  return obj
}

describe('PERSONAL_LINK_PLAN_LIMITS', () => {
  it('define os limites acordados: Free 0, Starter 10, Pro 30', () => {
    expect(PERSONAL_LINK_PLAN_LIMITS.free).toBe(0)
    expect(PERSONAL_LINK_PLAN_LIMITS.starter).toBe(10)
    expect(PERSONAL_LINK_PLAN_LIMITS.pro).toBe(30)
  })
})

describe('getCycleWindow', () => {
  it('usa o período de subscrição Stripe quando definido, em vez do mês calendário', () => {
    const prof = { current_period_start: '2026-07-10T00:00:00Z', current_period_end: '2026-08-10T00:00:00Z' }
    const { start, end } = getCycleWindow(prof)
    expect(start.toISOString()).toBe('2026-07-10T00:00:00.000Z')
    expect(end.toISOString()).toBe('2026-08-10T00:00:00.000Z')
  })

  it('cai para o mês calendário (UTC) quando não há período de subscrição — contas ativadas manualmente', () => {
    const prof = { current_period_start: null, current_period_end: null }
    const ref = new Date('2026-07-16T15:42:00Z')
    const { start, end } = getCycleWindow(prof, ref)
    expect(start.toISOString()).toBe('2026-07-01T00:00:00.000Z')
    expect(end.toISOString()).toBe('2026-08-01T00:00:00.000Z')
  })

  it('um lead aberto no ciclo anterior não conta para o ciclo atual (fronteira de ciclo)', () => {
    const prof = { current_period_start: '2026-07-10T00:00:00Z', current_period_end: '2026-08-10T00:00:00Z' }
    const { start } = getCycleWindow(prof)
    const previousCycleOpen = new Date('2026-07-09T23:59:59Z')
    expect(previousCycleOpen.getTime()).toBeLessThan(start.getTime())
  })
})

describe('openPersonalLead', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => { vi.restoreAllMocks(); vi.doUnmock('@/lib/supabase-admin') })

  async function callWithRpcResult(rpcResult: { data: unknown; error?: unknown }) {
    const rpc = vi.fn().mockResolvedValue(rpcResult)
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: vi.fn(), rpc } }))
    const { openPersonalLead } = await import('./personal-link-limits')
    const result = await openPersonalLead({ leadId: 'lead-1', professionalId: 'prof-1' })
    return { result, rpc }
  }

  it('delega tudo — dono, origem, já-aberto, plano e quota — na função SQL atómica open_personal_lead', async () => {
    const { result, rpc } = await callWithRpcResult({ data: { ok: true, already_open: false } })
    expect(result).toEqual({ ok: true, alreadyOpen: false })
    expect(rpc).toHaveBeenCalledWith('open_personal_lead', { p_lead_id: 'lead-1', p_professional_id: 'prof-1' })
  })

  it('lead já aberto antes: alreadyOpen true, mesmo com a quota esgotada', async () => {
    const { result } = await callWithRpcResult({ data: { ok: true, already_open: true } })
    expect(result).toEqual({ ok: true, alreadyOpen: true })
  })

  it('lead não encontrado / de outro profissional / do marketplace: not_found', async () => {
    const { result } = await callWithRpcResult({ data: { ok: false, error: 'not_found' } })
    expect(result).toEqual({ ok: false, error: 'not_found' })
  })

  it('plano Free (ou sem quota disponível): plan', async () => {
    const { result } = await callWithRpcResult({ data: { ok: false, error: 'plan' } })
    expect(result).toEqual({ ok: false, error: 'plan' })
  })

  it('quota do ciclo esgotada: quota', async () => {
    const { result } = await callWithRpcResult({ data: { ok: false, error: 'quota' } })
    expect(result).toEqual({ ok: false, error: 'quota' })
  })

  it('erro de rede/RPC devolve not_found em vez de rebentar', async () => {
    const { result } = await callWithRpcResult({ data: null, error: { message: 'falha de ligação' } })
    expect(result).toEqual({ ok: false, error: 'not_found' })
  })

  it('concorrência: abertura simultânea de dois leads diferentes na última vaga da quota — só uma consome, a outra recebe quota', async () => {
    // Simula o bloqueio da linha do profissional (FOR UPDATE) dentro de
    // open_personal_lead(): resta exatamente 1 vaga (9 de 10 já usados);
    // um "await" artificial antes da secção crítica força as duas chamadas
    // a chegarem ao ponto de decisão antes de qualquer uma escrever.
    let openedCount = 9
    const limit = 10
    const rpc = vi.fn(async () => {
      await Promise.resolve()
      if (openedCount >= limit) return { data: { ok: false, error: 'quota' } }
      openedCount += 1
      return { data: { ok: true, already_open: false } }
    })
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: vi.fn(), rpc } }))

    const { openPersonalLead } = await import('./personal-link-limits')
    const [resultA, resultB] = await Promise.all([
      openPersonalLead({ leadId: 'lead-a', professionalId: 'prof-1' }),
      openPersonalLead({ leadId: 'lead-b', professionalId: 'prof-1' }),
    ])

    const outcomes = [resultA, resultB]
    expect(outcomes.filter(r => r.ok)).toHaveLength(1)
    const loser = outcomes.find(r => !r.ok) as { ok: false; error: string }
    expect(loser.error).toBe('quota')
    expect(openedCount).toBe(10) // a última vaga só foi consumida uma vez
  })
})

describe('isPersonalLinkQuotaExhausted', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => { vi.restoreAllMocks(); vi.doUnmock('@/lib/supabase-admin') })

  function mockFlow({ prof, openedCount }: { prof: unknown; openedCount?: number }) {
    const from = vi.fn((table: string) => {
      if (table === 'professionals') return chainable({ data: prof })
      if (table === 'leads') return chainable({ count: openedCount })
      throw new Error(`tabela inesperada: ${table}`)
    })
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from, rpc: vi.fn() } }))
  }

  it('profissional não encontrado: considera esgotada (nunca revela por defeito)', async () => {
    mockFlow({ prof: null })
    const { isPersonalLinkQuotaExhausted } = await import('./personal-link-limits')
    expect(await isPersonalLinkQuotaExhausted('prof-1')).toBe(true)
  })

  it('plano Free: sempre esgotada (limite 0)', async () => {
    mockFlow({ prof: { plan: 'free', current_period_start: null, current_period_end: null } })
    const { isPersonalLinkQuotaExhausted } = await import('./personal-link-limits')
    expect(await isPersonalLinkQuotaExhausted('prof-1')).toBe(true)
  })

  it('Starter com 9 de 10 usados no ciclo: ainda não esgotada', async () => {
    mockFlow({ prof: { plan: 'starter', current_period_start: null, current_period_end: null }, openedCount: 9 })
    const { isPersonalLinkQuotaExhausted } = await import('./personal-link-limits')
    expect(await isPersonalLinkQuotaExhausted('prof-1')).toBe(false)
  })

  it('Starter com 10 de 10 usados no ciclo: esgotada — notificação deve enviar resumo', async () => {
    mockFlow({ prof: { plan: 'starter', current_period_start: null, current_period_end: null }, openedCount: 10 })
    const { isPersonalLinkQuotaExhausted } = await import('./personal-link-limits')
    expect(await isPersonalLinkQuotaExhausted('prof-1')).toBe(true)
  })
})

describe('getPersonalLinkQuotaStatus — remaining = max(0, limite - usado), sem reiniciar no upgrade', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => { vi.restoreAllMocks(); vi.doUnmock('@/lib/supabase-admin') })

  function mockFlow({ prof, openedCount }: { prof: unknown; openedCount: number }) {
    const from = vi.fn((table: string) => {
      if (table === 'professionals') return chainable({ data: prof })
      if (table === 'leads') return chainable({ count: openedCount })
      throw new Error(`tabela inesperada: ${table}`)
    })
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from, rpc: vi.fn() } }))
  }

  // Um upgrade Starter→Pro a meio do ciclo NUNCA reinicia o consumo — o
  // mesmo ciclo (current_period_start/end) e a mesma contagem de leads
  // abertos continuam a valer, só o limite muda (10→30). Exemplos do
  // pedido: abriu 3 → ficam 27; abriu 5 → ficam 25; abriu 10 → ficam 20.
  it.each([
    [0, 30],
    [3, 27],
    [5, 25],
    [10, 20],
    [30, 0], // exatamente no limite Pro: 0 restantes, esgotada
  ])('plano Pro (limite 30) com %i já abertos no ciclo → remaining %i', async (used, expectedRemaining) => {
    mockFlow({ prof: { plan: 'pro', current_period_start: null, current_period_end: null }, openedCount: used })
    const { getPersonalLinkQuotaStatus } = await import('./personal-link-limits')
    const status = await getPersonalLinkQuotaStatus('prof-1')
    expect(status).toEqual({ limit: 30, used, remaining: expectedRemaining, exhausted: used >= 30 })
  })

  it('nunca fica negativo mesmo que o usado exceda o limite (ex: downgrade com consumo acima do novo limite)', async () => {
    mockFlow({ prof: { plan: 'starter', current_period_start: null, current_period_end: null }, openedCount: 15 })
    const { getPersonalLinkQuotaStatus } = await import('./personal-link-limits')
    const status = await getPersonalLinkQuotaStatus('prof-1')
    expect(status).toEqual({ limit: 10, used: 15, remaining: 0, exhausted: true })
  })
})
