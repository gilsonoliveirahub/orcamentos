import { timingSafeEqual } from 'crypto'

// Fila de aprovação assíncrona do Aquiles — ver
// supabase/migration_aquiles_approval_queue.sql. A identidade do Aquiles
// nunca é um parâmetro que estes helpers controlam: as RPCs usam sempre
// `session_user` do lado da base (o role Postgres autenticado pela ligação
// pg aberta com a password dedicada), nunca um valor passado por aqui. O
// Aquiles só consegue criar pedidos (sempre 'pending') e consumir os seus
// próprios pedidos já aprovados, dentro da validade, com os parâmetros
// exatos da aprovação; nunca aprova/rejeita (exclusivo da sessão admin
// humana, ver app/api/admin/aquiles-actions).

export const AQUILES_ACTION_TYPES = [
  'delete_permanent',
  'money_movement',
  'security_access_change',
  'publish_deploy',
  'other_sensitive',
] as const
export type AquilesActionType = (typeof AQUILES_ACTION_TYPES)[number]

export type AquilesActionStatus = 'pending' | 'approved' | 'rejected' | 'consumed' | 'executed' | 'failed'

export type AquilesPendingAction = {
  id: string
  action_type: AquilesActionType
  summary: string
  payload: Record<string, unknown>
  requested_by: string
  status: AquilesActionStatus
  requested_at: string
  decided_at: string | null
  decided_by: string | null
  decision_note: string | null
  expires_at: string | null
  consumed_at: string | null
  executed_at: string | null
  result: Record<string, unknown> | null
}

export type AquilesActionsQueryClient = {
  query(sql: string, params?: unknown[]): PromiseLike<{ rows: unknown[] }>
}

const TOKEN_MIN_LENGTH = 24

export function tokenConfigured(token: string | undefined): token is string {
  return typeof token === 'string' && token.length >= TOKEN_MIN_LENGTH
}

export function verifyAquilesActionsToken(provided: string | null | undefined, expected: string | undefined) {
  if (typeof expected !== 'string' || expected.length < TOKEN_MIN_LENGTH || !provided) return false
  const providedBuffer = Buffer.from(provided)
  const expectedBuffer = Buffer.from(expected)
  if (providedBuffer.length !== expectedBuffer.length) return false
  return timingSafeEqual(providedBuffer, expectedBuffer)
}

export function extractBearerToken(authorization: string | null) {
  if (!authorization) return null
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

export function isValidActionType(value: unknown): value is AquilesActionType {
  return typeof value === 'string' && (AQUILES_ACTION_TYPES as readonly string[]).includes(value)
}

function toActionRow(value: unknown): AquilesPendingAction {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Linha de ação inválida devolvida pela RPC')
  }
  return value as AquilesPendingAction
}

export async function requestAction(
  client: AquilesActionsQueryClient,
  params: { actionType: AquilesActionType; summary: string; payload: Record<string, unknown> }
): Promise<string> {
  const { rows } = await client.query('select public.aquiles_request_action($1, $2, $3) as id', [
    params.actionType,
    params.summary,
    JSON.stringify(params.payload ?? {}),
  ])
  const row = rows[0] as { id?: string } | undefined
  if (!row?.id) throw new Error('RPC aquiles_request_action não devolveu id')
  return row.id
}

export async function getAction(client: AquilesActionsQueryClient, id: string): Promise<AquilesPendingAction | null> {
  const { rows } = await client.query('select public.aquiles_get_action($1) as action', [id])
  const raw = (rows[0] as { action?: unknown } | undefined)?.action
  return raw ? toActionRow(raw) : null
}

export async function listPending(client: AquilesActionsQueryClient): Promise<AquilesPendingAction[]> {
  const { rows } = await client.query('select public.aquiles_list_pending() as actions', [])
  const raw = (rows[0] as { actions?: unknown } | undefined)?.actions
  return Array.isArray(raw) ? raw.map(toActionRow) : []
}

// Único ponto que adquire a aprovação (approved -> consumed, utilização
// única) — NÃO significa que a operação real teve sucesso, só que esta
// aprovação está gasta e a operação pode começar. O chamador tem de passar
// o action_type e o payload EXATOS da operação que está mesmo a realizar;
// se não coincidirem com o que foi aprovado, ou já tiver sido consumida, ou
// estiver fora de validade, devolve false e a operação real nunca deve
// avançar. Depois de true, o chamador TEM de realizar a operação real e
// chamar recordExecutionResult com o resultado — nunca assumir sucesso só
// por aqui ter devolvido true.
export async function consumeApprovedAction(
  client: AquilesActionsQueryClient,
  id: string,
  actionType: AquilesActionType,
  payload: Record<string, unknown>
): Promise<boolean> {
  const { rows } = await client.query('select public.aquiles_consume_approved_action($1, $2, $3) as ok', [
    id,
    actionType,
    JSON.stringify(payload ?? {}),
  ])
  return Boolean((rows[0] as { ok?: boolean } | undefined)?.ok)
}

// Regista o resultado real: consumed -> executed (sucesso) ou consumed ->
// failed (falha). Só funciona depois de consumeApprovedAction ter devolvido
// true para o mesmo id; nunca pode repetir-se sobre a mesma linha.
export async function recordExecutionResult(
  client: AquilesActionsQueryClient,
  id: string,
  success: boolean,
  result: Record<string, unknown>
): Promise<boolean> {
  const { rows } = await client.query('select public.aquiles_record_execution_result($1, $2, $3) as ok', [
    id,
    success,
    JSON.stringify(result ?? {}),
  ])
  return Boolean((rows[0] as { ok?: boolean } | undefined)?.ok)
}
