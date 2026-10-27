export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

import { NextRequest } from 'next/server'
import { isValidActionType, listPending, requestAction, type AquilesActionType } from '@/lib/aquiles-actions'
import { authorizeAquilesActionsRequest, jsonNoStore, methodNotAllowed, openAquilesActionsClient } from '@/lib/aquiles-actions-http'

type RequestBody = { action_type?: unknown; summary?: unknown; payload?: unknown }

// POST: único ponto pelo qual o Aquiles consegue propor uma ação sensível —
// cria sempre em 'pending', com requested_by = session_user do lado da base
// (nunca um valor vindo do pedido). Nunca executa nada aqui; a execução real
// fica a cargo do endpoint que realiza essa operação, que só deve agir
// depois de aquiles_consume_approved_action confirmar approved+válido+
// parâmetros exatos.
export async function POST(req: NextRequest) {
  const auth = authorizeAquilesActionsRequest(req)
  if (!auth.ok) return auth.response

  const body = (await req.json().catch(() => null)) as RequestBody | null
  if (!body || !isValidActionType(body.action_type) || typeof body.summary !== 'string' || !body.summary.trim()) {
    return jsonNoStore({ error: 'action_type válido e summary são obrigatórios' }, { status: 400 })
  }
  const payload = typeof body.payload === 'object' && body.payload !== null ? (body.payload as Record<string, unknown>) : {}

  const client = openAquilesActionsClient(auth.dbUrl)
  try {
    await client.connect()
    const id = await requestAction(client, {
      actionType: body.action_type as AquilesActionType,
      summary: body.summary.trim(),
      payload,
    })
    return jsonNoStore({ id, status: 'pending' }, { status: 201 })
  } catch (error) {
    console.error('[api/internal/site-ops/actions] falha ao criar pedido:', error instanceof Error ? error.message : error)
    return jsonNoStore({ error: 'Falha ao criar pedido de ação' }, { status: 500 })
  } finally {
    await client.end().catch(() => {})
  }
}

// GET: lista os pedidos ainda relevantes (pending/approved) deste perfil —
// a RPC filtra por session_user, nunca por um valor que o pedido controla.
export async function GET(req: NextRequest) {
  const auth = authorizeAquilesActionsRequest(req)
  if (!auth.ok) return auth.response

  const client = openAquilesActionsClient(auth.dbUrl)
  try {
    await client.connect()
    const actions = await listPending(client)
    return jsonNoStore({ actions })
  } catch (error) {
    console.error('[api/internal/site-ops/actions] falha ao listar:', error instanceof Error ? error.message : error)
    return jsonNoStore({ error: 'Falha ao listar ações' }, { status: 500 })
  } finally {
    await client.end().catch(() => {})
  }
}

export const PUT = () => methodNotAllowed('GET, POST')
export const PATCH = PUT
export const DELETE = PUT
