import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Sem import estático de './checkout-lock' de propósito — esse ficheiro
// importa lib/supabase-admin, que rebenta sem SUPABASE_SERVICE_ROLE_KEY se
// for resolvido antes do mock estar em vigor. Import dinâmico em todos os
// testes deste ficheiro, mesmo para as funções puras.
function mockSupabaseAdminNoop() {
  vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: vi.fn(), rpc: vi.fn() } }))
}

describe('isLockStale — função pura, decide só pela idade da reserva', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => { vi.restoreAllMocks(); vi.doUnmock('@/lib/supabase-admin') })

  it('reserva mais nova que o limite: não é considerada obsoleta', async () => {
    mockSupabaseAdminNoop()
    const { isLockStale } = await import('./checkout-lock')
    const now = Date.now()
    const lock = { created_at: new Date(now - 1000).toISOString() }
    expect(isLockStale(lock, now)).toBe(false)
  })

  it('reserva mais velha que o limite: é considerada obsoleta', async () => {
    mockSupabaseAdminNoop()
    const { isLockStale, LOCK_STALE_MS } = await import('./checkout-lock')
    const now = Date.now()
    const lock = { created_at: new Date(now - LOCK_STALE_MS - 1000).toISOString() }
    expect(isLockStale(lock, now)).toBe(true)
  })

  it('exatamente no limite: ainda não é obsoleta (comparação estrita)', async () => {
    mockSupabaseAdminNoop()
    const { isLockStale, LOCK_STALE_MS } = await import('./checkout-lock')
    const now = Date.now()
    const lock = { created_at: new Date(now - LOCK_STALE_MS).toISOString() }
    expect(isLockStale(lock, now)).toBe(false)
  })
})

// Requisito 1 (revisão adversarial, 2026-09-19): retomar em vez de
// substituir uma reserva obsoleta sem sessão associada — nunca gera uma
// chave nova nesse caso (isso criaria uma segunda Checkout Session real se
// a chamada original ao Stripe tivesse na realidade sido bem sucedida e só
// a escrita local é que falhou). Função pura, sem I/O.
describe('resumeStaleLock — devolve sempre a MESMA operação já guardada, nunca inventa uma chave nova', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => { vi.restoreAllMocks(); vi.doUnmock('@/lib/supabase-admin') })

  it('devolve o idempotency_key, plan e cycle exatamente como estavam guardados na reserva', async () => {
    mockSupabaseAdminNoop()
    const { resumeStaleLock } = await import('./checkout-lock')
    const lock = { professional_id: 'prof-1', idempotency_key: 'k-original', plan: 'pro', cycle: 'annual', checkout_session_id: null, created_at: '2026-01-01T00:00:00.000Z' }
    expect(resumeStaleLock(lock)).toEqual({ idempotencyKey: 'k-original', plan: 'pro', cycle: 'annual' })
  })
})

function mockSupabaseAdmin({ insertError, existing }: { insertError?: { code?: string; message?: string } | null; existing?: unknown }) {
  const insert = vi.fn().mockResolvedValue({ error: insertError ?? null })
  const maybeSingle = vi.fn().mockResolvedValue({ data: existing ?? null })
  const del = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue(Promise.resolve({ error: null })) })
  const update = vi.fn()
  const rpc = vi.fn()
  const from = vi.fn((table: string) => {
    if (table !== 'checkout_locks') throw new Error(`tabela inesperada: ${table}`)
    return {
      insert,
      select: () => ({ eq: () => ({ maybeSingle }) }),
      update: (payload: unknown) => {
        update(payload)
        return { eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }
      },
      delete: () => ({ eq: () => ({ eq: del }) }),
    }
  })
  vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from, rpc } }))
  return { insert, maybeSingle, del, update, rpc }
}

describe('acquireCheckoutLock', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => { vi.restoreAllMocks(); vi.doUnmock('@/lib/supabase-admin') })

  it('sem reserva existente: cria uma nova e devolve um idempotencyKey', async () => {
    const { insert } = mockSupabaseAdmin({ insertError: null })
    const { acquireCheckoutLock } = await import('./checkout-lock')

    const result = await acquireCheckoutLock('prof-1', 'pro', 'monthly')

    expect(result.ok).toBe(true)
    if (result.ok) expect(typeof result.idempotencyKey).toBe('string')
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ professional_id: 'prof-1', plan: 'pro', cycle: 'monthly' }))
  })

  it('já existe uma reserva (violação de unicidade): devolve-a em vez de criar uma segunda', async () => {
    const existingLock = { professional_id: 'prof-1', idempotency_key: 'k1', plan: 'starter', cycle: 'annual', checkout_session_id: null, created_at: new Date().toISOString() }
    mockSupabaseAdmin({ insertError: { code: '23505', message: 'duplicate key' }, existing: existingLock })
    const { acquireCheckoutLock } = await import('./checkout-lock')

    const result = await acquireCheckoutLock('prof-1', 'pro', 'monthly')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.lock).toEqual(existingLock)
  })

  it('INSERT falha mas a reserva já não existe (foi libertada entre as duas leituras): repete e consegue reservar', async () => {
    let callCount = 0
    const insert = vi.fn().mockImplementation(() => {
      callCount++
      return Promise.resolve({ error: callCount === 1 ? { code: '23505' } : null })
    })
    const maybeSingle = vi.fn().mockResolvedValue({ data: null })
    const from = vi.fn((table: string) => {
      if (table !== 'checkout_locks') throw new Error(`tabela inesperada: ${table}`)
      return { insert, select: () => ({ eq: () => ({ maybeSingle }) }) }
    })
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))
    const { acquireCheckoutLock } = await import('./checkout-lock')

    const result = await acquireCheckoutLock('prof-1', 'pro', 'monthly')

    expect(result.ok).toBe(true)
    expect(insert).toHaveBeenCalledTimes(2)
  })
})

// Requisito 2 (revisão adversarial, 2026-09-19): toda a libertação/
// atualização é condicionada por (professional_id, idempotency_key) em
// conjunto — nunca só por professional_id.
describe('attachCheckoutSession / releaseCheckoutLock — sempre condicionados por (professional_id, idempotency_key)', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => { vi.restoreAllMocks(); vi.doUnmock('@/lib/supabase-admin') })

  it('attachCheckoutSession grava o checkout_session_id, filtrando por professional_id E idempotency_key', async () => {
    const eq2 = vi.fn().mockResolvedValue({ error: null })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    const update = vi.fn().mockReturnValue({ eq: eq1 })
    const from = vi.fn((table: string) => {
      if (table !== 'checkout_locks') throw new Error(`tabela inesperada: ${table}`)
      return { update }
    })
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))

    const { attachCheckoutSession } = await import('./checkout-lock')
    await attachCheckoutSession('prof-1', 'idem-abc', 'cs_123')

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ checkout_session_id: 'cs_123' }))
    expect(eq1).toHaveBeenCalledWith('professional_id', 'prof-1')
    expect(eq2).toHaveBeenCalledWith('idempotency_key', 'idem-abc')
  })

  it('releaseCheckoutLock apaga a reserva, filtrando por professional_id E idempotency_key', async () => {
    const eq2 = vi.fn().mockResolvedValue({ error: null })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    const del = vi.fn().mockReturnValue({ eq: eq1 })
    const from = vi.fn((table: string) => {
      if (table !== 'checkout_locks') throw new Error(`tabela inesperada: ${table}`)
      return { delete: del }
    })
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))

    const { releaseCheckoutLock } = await import('./checkout-lock')
    await releaseCheckoutLock('prof-1', 'idem-abc')

    expect(eq1).toHaveBeenCalledWith('professional_id', 'prof-1')
    expect(eq2).toHaveBeenCalledWith('idempotency_key', 'idem-abc')
  })

  // Cenário pedido explicitamente (requisito 10): um pedido antigo (ex: um
  // retry perdido que só agora chega) tenta libertar a reserva de um
  // profissional, mas já existe uma reserva MAIS RECENTE (idempotency_key
  // diferente) para essa conta — a condição por chave garante que o filtro
  // não encontra a linha certa (a real BD teria 0 linhas a corresponder);
  // aqui confirmamos só que o pedido de libertação é sempre feito com a
  // chave ANTIGA que o chamador tinha, nunca com a atual — é essa condição,
  // aplicada pela BD real, que impede a substituição.
  it('libertação usa sempre a idempotency_key que o PRÓPRIO chamador tem — nunca a de outra operação', async () => {
    const eq2 = vi.fn().mockResolvedValue({ error: null })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    const del = vi.fn().mockReturnValue({ eq: eq1 })
    const from = vi.fn(() => ({ delete: del }))
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))

    const { releaseCheckoutLock } = await import('./checkout-lock')
    // Um pedido "antigo" que só conhece a SUA PRÓPRIA chave (k-antiga) —
    // mesmo que uma reserva mais recente (k-nova) exista agora para o
    // mesmo profissional, esta chamada nunca sabe nem usa k-nova.
    await releaseCheckoutLock('prof-1', 'k-antiga')

    expect(eq2).toHaveBeenCalledWith('idempotency_key', 'k-antiga')
    expect(eq2).not.toHaveBeenCalledWith('idempotency_key', 'k-nova')
  })
})

// Requisito 3 (revisão adversarial, 2026-09-19): a troca de uma reserva
// expirada por uma nova é feita através de uma função SQL transacional
// (replace_expired_checkout_lock, ver migração) — nunca dois passos
// separados (DELETE + INSERT) que deixassem uma janela de corrida.
describe('replaceExpiredLock — troca atómica via RPC, guardada pelo idempotency_key esperado', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => { vi.restoreAllMocks(); vi.doUnmock('@/lib/supabase-admin') })

  it('quando a RPC confirma a troca (devolve a nova chave): replaced=true', async () => {
    const rpc = vi.fn().mockImplementation((_name: string, params: any) => Promise.resolve({ data: params.p_new_idempotency_key, error: null }))
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { rpc } }))

    const { replaceExpiredLock } = await import('./checkout-lock')
    const result = await replaceExpiredLock('prof-1', 'k-expirada', 'pro', 'annual')

    expect(result.replaced).toBe(true)
    expect(rpc).toHaveBeenCalledWith('replace_expired_checkout_lock', expect.objectContaining({
      p_professional_id: 'prof-1', p_expected_idempotency_key: 'k-expirada', p_new_plan: 'pro', p_new_cycle: 'annual',
    }))
  })

  it('quando a RPC deteta que a reserva já mudou (devolve uma chave diferente da nova): replaced=false, nunca finge sucesso', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 'k-de-outra-operacao-que-ja-existia', error: null })
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { rpc } }))

    const { replaceExpiredLock } = await import('./checkout-lock')
    const result = await replaceExpiredLock('prof-1', 'k-expirada', 'pro', 'annual')

    expect(result.replaced).toBe(false)
    expect(result.idempotencyKey).toBe('k-de-outra-operacao-que-ja-existia')
  })

  it('erro na RPC: propaga como excepção, nunca finge sucesso', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'falha de rede' } })
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { rpc } }))

    const { replaceExpiredLock } = await import('./checkout-lock')
    await expect(replaceExpiredLock('prof-1', 'k-expirada', 'pro', 'annual')).rejects.toThrow('falha de rede')
  })
})
