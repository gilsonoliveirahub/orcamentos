export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getAuthenticatedAdmin } from '@/lib/admin-auth'

const DECISIONS = ['approved', 'rejected'] as const
type Decision = (typeof DECISIONS)[number]

// Validade da aprovação: passado este prazo, aquiles_consume_approved_action
// deixa de aceitar a ação mesmo que ainda esteja 'approved' — não é preciso
// nenhum job a mudar o status para isso, a RPC verifica expires_at > now()
// em cada tentativa de consumo.
const APPROVAL_VALIDITY_MINUTES = 30

function isDecision(value: unknown): value is Decision {
  return typeof value === 'string' && (DECISIONS as readonly string[]).includes(value)
}

// Único caminho de aprovação/rejeição de todo o sistema — exige a mesma
// sessão admin (getAuthenticatedAdmin) usada no resto do painel /admin. O
// token do Aquiles nunca chega aqui: esta rota nem verifica esse token,
// então não há forma de o Aquiles se auto-aprovar mesmo com o token exposto.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAuthenticatedAdmin()
  if (!admin) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

  const { id } = await params
  const body = (await req.json().catch(() => null)) as { decision?: unknown; note?: unknown } | null
  if (!isDecision(body?.decision)) {
    return NextResponse.json({ error: 'decision deve ser "approved" ou "rejected"' }, { status: 400 })
  }
  const note = typeof body?.note === 'string' ? body.note.trim() || null : null
  const decidedAt = new Date()
  const expiresAt = body.decision === 'approved' ? new Date(decidedAt.getTime() + APPROVAL_VALIDITY_MINUTES * 60_000) : null

  // Só transita pending -> approved/rejected (filtro .eq('status','pending'))
  // — nunca reabre uma ação já decidida ou já executada, mesmo que o pedido
  // chegue duplicado ou atrasado. expires_at só é definido ao aprovar; é a
  // aquiles_consume_approved_action() que depois faz valer este prazo.
  const { data, error } = await supabaseAdmin
    .from('aquiles_pending_actions')
    .update({
      status: body.decision,
      decided_at: decidedAt.toISOString(),
      decided_by: admin.id,
      decision_note: note,
      expires_at: expiresAt ? expiresAt.toISOString() : null,
    })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id, status, expires_at')
    .maybeSingle()

  if (error) {
    console.error('[api/admin/aquiles-actions/decide] falha:', error.message)
    return NextResponse.json({ error: 'Falha ao decidir ação' }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'Ação não encontrada ou já decidida' }, { status: 409 })

  return NextResponse.json({ id: data.id, status: data.status, expires_at: data.expires_at })
}
