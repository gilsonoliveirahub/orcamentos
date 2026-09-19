import { supabaseAdmin } from '@/lib/supabase-admin'

// Decisão de negócio (2026-09-19): uma cobrança duplicada confirmada tem de
// ser analisada e reembolsada manualmente — nunca cancelar/reembolsar
// automaticamente sem identificar qual subscrição é a legítima. Esta função
// só regista o conflito para intervenção administrativa; nunca cancela,
// reembolsa nem escolhe qual subscrição "ganha".
export type ConflictSource =
  | 'checkout_reconciliation'
  | 'checkout.session.completed'
  | 'invoice.payment_succeeded'
  | 'customer.subscription.updated'

/**
 * FALHA REAL corrigida (2026-09-19, revisão adversarial, requisito 7): sem
 * isto, o MESMO par (existing, new) podia ficar registado em duas linhas
 * diferentes se o mesmo conflito fosse detetado por duas entregas de
 * webhook distintas (eventos DIFERENTES — a guarda de idempotência em
 * stripe_webhook_events só cobre entregas repetidas do MESMO evento, nunca
 * dois eventos diferentes a apanharem a mesma inconsistência). Verifica
 * primeiro se já existe um conflito por resolver com este par exato; o
 * índice único parcial na migração (subscription_conflicts_unresolved_pair_idx)
 * é o backstop para a janela de corrida entre o SELECT e o INSERT — uma
 * violação desse índice é tratada como "já está registado", nunca como erro.
 */
export async function flagSubscriptionConflict(params: {
  professionalId: string
  existingSubscriptionId: string | null
  newSubscriptionId: string
  source: ConflictSource
  eventId?: string | null
}): Promise<void> {
  let existingQuery = supabaseAdmin
    .from('subscription_conflicts')
    .select('id')
    .eq('professional_id', params.professionalId)
    .eq('new_subscription_id', params.newSubscriptionId)
    .eq('resolved', false)

  existingQuery = params.existingSubscriptionId === null
    ? existingQuery.is('existing_subscription_id', null)
    : existingQuery.eq('existing_subscription_id', params.existingSubscriptionId)

  const { data: already } = await existingQuery.maybeSingle()
  if (already) return // já registado e por resolver, nunca duplica

  const { error } = await supabaseAdmin.from('subscription_conflicts').insert({
    professional_id: params.professionalId,
    existing_subscription_id: params.existingSubscriptionId,
    new_subscription_id: params.newSubscriptionId,
    source: params.source,
    event_id: params.eventId ?? null,
  })

  // 23505 = unique_violation — outra chamada concorrente inseriu o mesmo
  // par entre o SELECT acima e este INSERT (o índice único parcial é
  // exatamente para isto). Já está registado, não é um erro real.
  if (error && error.code !== '23505') {
    throw new Error(error.message || 'Falha ao registar conflito de subscrição')
  }
}
