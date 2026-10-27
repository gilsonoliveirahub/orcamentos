export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

import { NextRequest } from 'next/server'
import { getCapability } from '@/lib/aquiles-capabilities/registry'
import { authorizeAquilesActionsRequest, jsonNoStore, methodNotAllowed } from '@/lib/aquiles-actions-http'

// Preview sem efeitos — não toca na fila de aprovação. Usado pelo Aquiles
// para construir o payload exato que vai propor (ver POST /actions) com uma
// descrição fiel do que vai mudar, nunca inventada.
export async function POST(req: NextRequest, { params }: { params: Promise<{ capabilityId: string }> }) {
  const auth = authorizeAquilesActionsRequest(req)
  if (!auth.ok) return auth.response

  const { capabilityId } = await params
  const capability = getCapability(capabilityId)
  if (!capability) return jsonNoStore({ error: 'Capacidade desconhecida' }, { status: 404 })

  const body = (await req.json().catch(() => null)) as { params?: unknown } | null
  const capabilityParams = typeof body?.params === 'object' && body.params !== null ? body.params : {}

  try {
    const preview = await capability.preview(capabilityParams as never)
    return jsonNoStore({ preview })
  } catch (error) {
    console.error(`[api/internal/site-ops/capabilities/${capabilityId}/preview] falha:`, error instanceof Error ? error.message : error)
    return jsonNoStore({ error: 'Falha ao gerar preview' }, { status: 500 })
  }
}

export const GET = () => methodNotAllowed('POST')
export const PUT = GET
export const PATCH = GET
export const DELETE = GET
