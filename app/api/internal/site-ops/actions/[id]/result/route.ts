export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

import { NextRequest } from 'next/server'
import { recordExecutionResult } from '@/lib/aquiles-actions'
import { authorizeAquilesActionsRequest, jsonNoStore, methodNotAllowed, openAquilesActionsClient } from '@/lib/aquiles-actions-http'

type ResultBody = { success?: unknown; result?: unknown }

// PATCH: regista o resultado REAL de uma ação já consumida (consumed ->
// executed | failed). Só funciona depois de PATCH .../actions/:id ter
// devolvido 200 (status='consumed') para este id; nunca pode repetir-se
// sobre a mesma linha (depois de executed/failed já não está em 'consumed').
// Uma falha real (ex: a chamada à Stripe/eliminação rebentou a meio) deve
// ser registada aqui com success=false — nunca omitida nem confundida com
// sucesso.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = authorizeAquilesActionsRequest(req)
  if (!auth.ok) return auth.response
  const { id } = await params

  const body = (await req.json().catch(() => null)) as ResultBody | null
  if (!body || typeof body.success !== 'boolean') {
    return jsonNoStore({ error: 'success (boolean) é obrigatório' }, { status: 400 })
  }
  const result = typeof body.result === 'object' && body.result !== null ? (body.result as Record<string, unknown>) : {}

  const client = openAquilesActionsClient(auth.dbUrl)
  try {
    await client.connect()
    const recorded = await recordExecutionResult(client, id, body.success, result)
    if (!recorded) {
      return jsonNoStore({ error: 'Ação não está em consumed (resultado já registado, ou nunca foi consumida)' }, { status: 409 })
    }
    return jsonNoStore({ id, status: body.success ? 'executed' : 'failed' })
  } catch (error) {
    console.error('[api/internal/site-ops/actions/:id/result] falha ao registar resultado:', error instanceof Error ? error.message : error)
    return jsonNoStore({ error: 'Falha ao registar resultado' }, { status: 500 })
  } finally {
    await client.end().catch(() => {})
  }
}

export const GET = () => methodNotAllowed('PATCH')
export const POST = GET
export const PUT = GET
export const DELETE = GET
