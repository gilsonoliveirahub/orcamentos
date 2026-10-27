export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

import { NextRequest } from 'next/server'
import { consumeApprovedAction, getAction, isValidActionType } from '@/lib/aquiles-actions'
import { authorizeAquilesActionsRequest, jsonNoStore, methodNotAllowed, openAquilesActionsClient } from '@/lib/aquiles-actions-http'

type ConsumeBody = { action_type?: unknown; payload?: unknown }

// GET: estado atual de um pedido já feito por este perfil — a RPC filtra
// por session_user, nunca por um valor que o pedido controla.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = authorizeAquilesActionsRequest(req)
  if (!auth.ok) return auth.response
  const { id } = await params

  const client = openAquilesActionsClient(auth.dbUrl)
  try {
    await client.connect()
    const action = await getAction(client, id)
    if (!action) return jsonNoStore({ error: 'Ação não encontrada' }, { status: 404 })
    return jsonNoStore({ action })
  } catch (error) {
    console.error('[api/internal/site-ops/actions/:id] falha ao consultar:', error instanceof Error ? error.message : error)
    return jsonNoStore({ error: 'Falha ao consultar ação' }, { status: 500 })
  } finally {
    await client.end().catch(() => {})
  }
}

// PATCH: consome uma aprovação (approved -> consumed) — o chamador tem de
// enviar o action_type e o payload EXATOS da operação real que está a
// realizar neste preciso momento. A RPC só confirma true se
// status='approved', dentro da validade e os parâmetros coincidirem byte a
// byte com o que foi aprovado — e transita atomicamente para 'consumed' na
// mesma instrução, por isso é de utilização única. ISTO NÃO SIGNIFICA QUE A
// OPERAÇÃO REAL TEVE SUCESSO — só que a aprovação está gasta e a operação
// pode começar. Qualquer capacidade real futura (apagar, mover dinheiro,
// publicar) deve chamar este endpoint PRIMEIRO, só proceder com o efeito
// real se vier 200, e DEPOIS chamar POST .../result com o resultado real
// (sucesso ou falha) — nunca assumir sucesso só por aqui ter respondido 200.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = authorizeAquilesActionsRequest(req)
  if (!auth.ok) return auth.response
  const { id } = await params

  const body = (await req.json().catch(() => null)) as ConsumeBody | null
  if (!body || !isValidActionType(body.action_type)) {
    return jsonNoStore({ error: 'action_type válido é obrigatório' }, { status: 400 })
  }
  const payload = typeof body.payload === 'object' && body.payload !== null ? (body.payload as Record<string, unknown>) : {}

  const client = openAquilesActionsClient(auth.dbUrl)
  try {
    await client.connect()
    const consumed = await consumeApprovedAction(client, id, body.action_type, payload)
    if (!consumed) {
      return jsonNoStore(
        { error: 'Ação não aprovada, expirada, já consumida, ou parâmetros não coincidem com a aprovação' },
        { status: 409 }
      )
    }
    return jsonNoStore({ id, status: 'consumed' })
  } catch (error) {
    console.error('[api/internal/site-ops/actions/:id] falha ao consumir aprovação:', error instanceof Error ? error.message : error)
    return jsonNoStore({ error: 'Falha ao consumir aprovação' }, { status: 500 })
  } finally {
    await client.end().catch(() => {})
  }
}

export const POST = () => methodNotAllowed('GET, PATCH')
export const PUT = POST
export const DELETE = POST
