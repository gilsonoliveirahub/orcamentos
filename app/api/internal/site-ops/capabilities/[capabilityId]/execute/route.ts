export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

import { NextRequest } from 'next/server'
import { getCapability } from '@/lib/aquiles-capabilities/registry'
import { consumeApprovedAction, getAction, recordExecutionResult } from '@/lib/aquiles-actions'
import { authorizeAquilesActionsRequest, jsonNoStore, methodNotAllowed, openAquilesActionsClient } from '@/lib/aquiles-actions-http'

type ExecuteBody = { action_id?: unknown; params?: unknown }

// Único ponto de execução real de qualquer capacidade administrativa dada
// ao Aquiles. Fluxo, sempre nesta ordem, nunca invertido:
//   1. Consome a aprovação (approved -> consumed) com o payload EXATO
//      {capability_id, params} — tem de ser bit a bit igual ao que foi
//      aprovado, incluindo esta capability_id.
//   2. Só depois de consumida, chama capability.execute() — a operação
//      real, reutilizando as regras de negócio já existentes.
//   3. Regista sempre o resultado (sucesso ou falha real) antes de
//      responder — nunca omitido, nunca assumido.
export async function POST(req: NextRequest, { params: routeParams }: { params: Promise<{ capabilityId: string }> }) {
  const auth = authorizeAquilesActionsRequest(req)
  if (!auth.ok) return auth.response

  const { capabilityId } = await routeParams
  const capability = getCapability(capabilityId)
  if (!capability) return jsonNoStore({ error: 'Capacidade desconhecida' }, { status: 404 })

  const body = (await req.json().catch(() => null)) as ExecuteBody | null
  const actionId = typeof body?.action_id === 'string' ? body.action_id : null
  if (!actionId) return jsonNoStore({ error: 'action_id é obrigatório' }, { status: 400 })
  const capabilityParams = typeof body?.params === 'object' && body?.params !== null ? body.params : {}

  const client = openAquilesActionsClient(auth.dbUrl)
  try {
    await client.connect()

    const consumed = await consumeApprovedAction(client, actionId, capability.actionType, {
      capability_id: capabilityId,
      params: capabilityParams,
    })
    if (!consumed) {
      return jsonNoStore(
        { error: 'Ação não aprovada, expirada, já consumida, ou parâmetros não coincidem com a aprovação' },
        { status: 409 }
      )
    }

    const actionRow = await getAction(client, actionId)
    const approvedByAdminId = actionRow?.decided_by ?? null

    try {
      const result = await capability.execute(capabilityParams as never, { actionId, approvedByAdminId })
      await recordExecutionResult(client, actionId, true, result)
      return jsonNoStore({ id: actionId, status: 'executed', result })
    } catch (execError) {
      const message = execError instanceof Error ? execError.message : 'Falha desconhecida ao executar'
      await recordExecutionResult(client, actionId, false, { error: message })
      return jsonNoStore({ id: actionId, status: 'failed', error: message })
    }
  } catch (error) {
    console.error(`[api/internal/site-ops/capabilities/${capabilityId}/execute] falha:`, error instanceof Error ? error.message : error)
    return jsonNoStore({ error: 'Falha ao executar capacidade' }, { status: 500 })
  } finally {
    await client.end().catch(() => {})
  }
}

export const GET = () => methodNotAllowed('POST')
export const PUT = GET
export const PATCH = GET
export const DELETE = GET
