import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Query encadeável (select().eq().eq().is()/.eq().maybeSingle()) — o código
// real (lib/subscription-conflicts.ts) encadeia um número variável de
// .eq()/.is() dependendo de existingSubscriptionId ser null ou não; este
// mock aceita qualquer sequência e só regista as chamadas para inspeção.
function mockSupabaseAdmin({ existing, insertError }: { existing?: unknown; insertError?: { code?: string; message?: string } | null }) {
  const insert = vi.fn().mockResolvedValue({ error: insertError ?? null })
  const eqCalls: unknown[][] = []
  const isCalls: unknown[][] = []
  const chain: any = {
    eq: (...args: unknown[]) => { eqCalls.push(args); return chain },
    is: (...args: unknown[]) => { isCalls.push(args); return chain },
    maybeSingle: async () => ({ data: existing ?? null }),
  }
  const from = vi.fn((table: string) => {
    if (table !== 'subscription_conflicts') throw new Error(`tabela inesperada: ${table}`)
    return { select: () => chain, insert }
  })
  vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from } }))
  return { insert, eqCalls, isCalls }
}

describe('flagSubscriptionConflict — só regista, nunca cancela nem reembolsa', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => { vi.restoreAllMocks(); vi.doUnmock('@/lib/supabase-admin') })

  it('sem conflito igual já registado: insere um registo com os campos recebidos', async () => {
    const { insert } = mockSupabaseAdmin({ existing: null })
    const { flagSubscriptionConflict } = await import('./subscription-conflicts')

    await flagSubscriptionConflict({
      professionalId: 'prof-1',
      existingSubscriptionId: 'sub_antiga',
      newSubscriptionId: 'sub_nova',
      source: 'checkout.session.completed',
      eventId: 'evt_1',
    })

    expect(insert).toHaveBeenCalledWith({
      professional_id: 'prof-1',
      existing_subscription_id: 'sub_antiga',
      new_subscription_id: 'sub_nova',
      source: 'checkout.session.completed',
      event_id: 'evt_1',
    })
  })

  it('eventId omitido: grava null, nunca undefined (undefined seria removido do payload silenciosamente)', async () => {
    const { insert } = mockSupabaseAdmin({ existing: null })
    const { flagSubscriptionConflict } = await import('./subscription-conflicts')

    await flagSubscriptionConflict({
      professionalId: 'prof-1',
      existingSubscriptionId: null,
      newSubscriptionId: 'sub_a,sub_b',
      source: 'checkout_reconciliation',
    })

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ event_id: null }))
  })

  it('existingSubscriptionId null: usa .is(), nunca .eq() com null (PostgREST trata-os de forma diferente)', async () => {
    const { isCalls, eqCalls } = mockSupabaseAdmin({ existing: null })
    const { flagSubscriptionConflict } = await import('./subscription-conflicts')

    await flagSubscriptionConflict({
      professionalId: 'prof-1',
      existingSubscriptionId: null,
      newSubscriptionId: 'sub_a,sub_b',
      source: 'checkout_reconciliation',
    })

    expect(isCalls).toContainEqual(['existing_subscription_id', null])
    expect(eqCalls).not.toContainEqual(['existing_subscription_id', null])
  })

  // Requisito 7 (revisão adversarial, 2026-09-19): idempotência — o MESMO
  // par (existing, new) por resolver nunca fica registado em duas linhas.
  it('já existe um conflito por resolver com o mesmo par (existing, new): não insere de novo', async () => {
    const { insert } = mockSupabaseAdmin({ existing: { id: 'conflito-ja-existente' } })
    const { flagSubscriptionConflict } = await import('./subscription-conflicts')

    await flagSubscriptionConflict({
      professionalId: 'prof-1',
      existingSubscriptionId: 'sub_antiga',
      newSubscriptionId: 'sub_nova',
      source: 'invoice.payment_succeeded',
    })

    expect(insert).not.toHaveBeenCalled()
  })

  // Backstop do índice único parcial (subscription_conflicts_unresolved_pair_idx)
  // para a janela de corrida entre o SELECT e o INSERT: se outra chamada
  // concorrente inseriu o mesmo par entretanto, a violação de unicidade
  // (23505) é tratada como "já está registado", nunca como erro real.
  it('INSERT falha por violação de unicidade (23505) — corrida com outra chamada concorrente: trata como já registado, não propaga erro', async () => {
    mockSupabaseAdmin({ existing: null, insertError: { code: '23505' } })
    const { flagSubscriptionConflict } = await import('./subscription-conflicts')

    await expect(flagSubscriptionConflict({
      professionalId: 'prof-1',
      existingSubscriptionId: 'sub_antiga',
      newSubscriptionId: 'sub_nova',
      source: 'customer.subscription.updated',
    })).resolves.toBeUndefined()
  })

  it('INSERT falha por outro motivo (não 23505): propaga o erro', async () => {
    mockSupabaseAdmin({ existing: null, insertError: { code: '500', message: 'falha de rede' } })
    const { flagSubscriptionConflict } = await import('./subscription-conflicts')

    await expect(flagSubscriptionConflict({
      professionalId: 'prof-1',
      existingSubscriptionId: 'sub_antiga',
      newSubscriptionId: 'sub_nova',
      source: 'customer.subscription.updated',
    })).rejects.toThrow('falha de rede')
  })
})
