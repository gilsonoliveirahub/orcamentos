import { randomUUID } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase-admin'

// Proteção contra dupla subscrição (2026-09-19, decisão de negócio: corrigir
// antes de haver clientes pagantes). Revisão adversarial (2026-09-19,
// segunda passagem) corrigiu 2 falhas reais na primeira versão — ver os
// comentários junto de resumeStaleLock e replaceExpiredLock.
//
// A atomicidade da reserva em si vem da PRIMARY KEY (professional_id) em
// `checkout_locks`: dois pedidos concorrentes só podem ambos tentar o
// INSERT, mas só um consegue — não há janela de corrida entre "verificar" e
// "criar" porque são a mesma operação atómica.

export const LOCK_STALE_MS = 2 * 60 * 1000

export interface CheckoutLockRow {
  professional_id: string
  idempotency_key: string
  plan: string
  cycle: string
  checkout_session_id: string | null
  created_at: string
}

export function isLockStale(lock: { created_at: string }, now: number = Date.now()): boolean {
  return now - new Date(lock.created_at).getTime() > LOCK_STALE_MS
}

export type AcquireResult =
  | { ok: true; idempotencyKey: string }
  | { ok: false; lock: CheckoutLockRow }

/**
 * Tenta reservar. Se já existir uma reserva para este profissional, devolve-a
 * (o chamador decide se é uma reserva viva a reutilizar, obsoleta a retomar
 * com resumeStaleLock, ou terminada a substituir com replaceExpiredLock).
 */
export async function acquireCheckoutLock(
  professionalId: string,
  plan: string,
  cycle: string,
  _attempt = 0
): Promise<AcquireResult> {
  const idempotencyKey = randomUUID()
  const { error } = await supabaseAdmin.from('checkout_locks').insert({
    professional_id: professionalId,
    idempotency_key: idempotencyKey,
    plan,
    cycle,
    checkout_session_id: null,
  })
  if (!error) return { ok: true, idempotencyKey }

  const { data: existing } = await supabaseAdmin
    .from('checkout_locks')
    .select('*')
    .eq('professional_id', professionalId)
    .maybeSingle()

  if (existing) return { ok: false, lock: existing as CheckoutLockRow }

  // O INSERT falhou (quase certamente unique_violation) mas a reserva já não
  // está lá quando fomos ler — foi libertada entre as duas chamadas. Repete
  // uma única vez; se falhar outra vez sem motivo visível, propaga o erro
  // original em vez de tentar para sempre.
  if (_attempt === 0) return acquireCheckoutLock(professionalId, plan, cycle, 1)
  throw new Error(error.message || 'Falha ao reservar operação de checkout')
}

// Requisito 2 (revisão adversarial, 2026-09-19): toda a libertação/
// atualização de checkout_locks é condicionada por (professional_id E
// idempotency_key) em conjunto — nunca só por professional_id. Um pedido
// antigo/atrasado (ex: um retry perdido que só agora chega, depois de a
// reserva já ter sido substituída por uma operação mais recente para a
// mesma conta) nunca consegue apagar nem sobrescrever uma reserva mais
// recente, porque esta condiciona sempre pela chave que ELE esperava
// encontrar — se já não for essa, a operação simplesmente não afeta nada
// (0 linhas correspondem, sem erro, sem efeito).

export async function attachCheckoutSession(professionalId: string, idempotencyKey: string, sessionId: string): Promise<void> {
  await supabaseAdmin
    .from('checkout_locks')
    .update({ checkout_session_id: sessionId, updated_at: new Date().toISOString() })
    .eq('professional_id', professionalId)
    .eq('idempotency_key', idempotencyKey)
}

export async function releaseCheckoutLock(professionalId: string, idempotencyKey: string): Promise<void> {
  await supabaseAdmin
    .from('checkout_locks')
    .delete()
    .eq('professional_id', professionalId)
    .eq('idempotency_key', idempotencyKey)
}

/**
 * FALHA REAL corrigida (2026-09-19, revisão adversarial): a versão anterior
 * libertava e recriava a reserva com uma idempotency_key NOVA sempre que a
 * via "obsoleta". Isto é inseguro — se a chamada original ao Stripe tinha
 * na realidade sido bem sucedida e só a ESCRITA local do session_id é que
 * falhou depois (crash, timeout, erro de rede DEPOIS do Stripe já ter
 * respondido), uma chave nova cria uma SEGUNDA Checkout Session/subscrição
 * real. Retomar a MESMA operação com a MESMA idempotency_key é sempre
 * seguro: se o Stripe já tinha processado o pedido com essa chave, devolve
 * a resposta em cache (mesma sessão, nunca duplica); se nunca tinha
 * chegado a processar, cria-a agora normalmente. Função pura — só lê o
 * que já está na reserva, nunca toca na BD (é o chamador que decide o que
 * fazer com o resultado).
 */
export function resumeStaleLock(lock: CheckoutLockRow): { idempotencyKey: string; plan: string; cycle: string } {
  return { idempotencyKey: lock.idempotency_key, plan: lock.plan, cycle: lock.cycle }
}

/**
 * Só é seguro chamar isto depois de o Stripe já ter confirmado
 * (checkout.sessions.retrieve) que a sessão associada à reserva terminou
 * (status 'expired') — nesse caso sim é seguro abrir uma operação nova,
 * com uma chave nova. A troca (fechar a expirada, abrir a nova) é atómica —
 * corre dentro de replace_expired_checkout_lock (migration SQL), guardada
 * por um advisory lock por profissional, nunca dois passos separados que
 * deixassem uma janela de corrida entre apagar e inserir.
 *
 * Guardado pelo idempotency_key esperado: se a reserva já tiver mudado
 * entretanto (outro pedido tratou disto primeiro, ou já existe uma reserva
 * mais recente para esta conta), esta chamada não troca nada — devolve
 * `replaced: false` e o idempotency_key REAL que está lá agora, para o
 * chamador repetir a resolução do zero em vez de assumir que ganhou a
 * reserva.
 */
export async function replaceExpiredLock(
  professionalId: string,
  expectedIdempotencyKey: string,
  newPlan: string,
  newCycle: string
): Promise<{ replaced: boolean; idempotencyKey: string | null }> {
  const newIdempotencyKey = randomUUID()
  const { data, error } = await supabaseAdmin.rpc('replace_expired_checkout_lock', {
    p_professional_id: professionalId,
    p_expected_idempotency_key: expectedIdempotencyKey,
    p_new_idempotency_key: newIdempotencyKey,
    p_new_plan: newPlan,
    p_new_cycle: newCycle,
  })
  if (error) throw new Error(error.message || 'Falha ao substituir a reserva expirada')
  return { replaced: data === newIdempotencyKey, idempotencyKey: data ?? null }
}
