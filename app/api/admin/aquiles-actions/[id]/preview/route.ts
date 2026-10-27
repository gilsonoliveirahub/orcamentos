export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getAuthenticatedAdmin } from '@/lib/admin-auth'
import { getCapability } from '@/lib/aquiles-capabilities/registry'

// Recalcula o preview de uma ação pendente a partir do registo de
// capacidades, usando o payload gravado em aquiles_pending_actions — nunca
// confia no "summary" de texto livre que o Aquiles escreveu, para o admin
// ver sempre o alvo real e o efeito real antes de aprovar.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAuthenticatedAdmin()
  if (!admin) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

  const { id } = await params
  const { data: action, error } = await supabaseAdmin
    .from('aquiles_pending_actions')
    .select('id, action_type, payload, status')
    .eq('id', id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!action) return NextResponse.json({ error: 'Ação não encontrada' }, { status: 404 })

  const payload = (action.payload || {}) as { capability_id?: unknown; params?: unknown }
  if (typeof payload.capability_id !== 'string') {
    return NextResponse.json({ preview: null, reason: 'Esta ação não é baseada numa capacidade registada' })
  }

  const capability = getCapability(payload.capability_id)
  if (!capability) {
    return NextResponse.json({ preview: null, reason: `Capacidade "${payload.capability_id}" não existe (pode ter sido removida)` })
  }

  try {
    const preview = await capability.preview((payload.params ?? {}) as never)
    return NextResponse.json({ preview })
  } catch (previewError) {
    console.error('[api/admin/aquiles-actions/:id/preview] falha:', previewError instanceof Error ? previewError.message : previewError)
    return NextResponse.json({ error: 'Falha ao calcular preview' }, { status: 500 })
  }
}
