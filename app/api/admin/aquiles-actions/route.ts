export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getAuthenticatedAdmin } from '@/lib/admin-auth'

const VALID_STATUSES = ['pending', 'approved', 'rejected', 'executed', 'expired']

// Lista pedidos do Aquiles para o painel /admin/aquiles. Usa supabaseAdmin
// (service_role, ignora RLS) porque corre já autenticado como admin humano —
// nunca o token do Aquiles, que nem sequer tem SELECT nesta tabela.
export async function GET(req: NextRequest) {
  const admin = await getAuthenticatedAdmin()
  if (!admin) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

  const status = req.nextUrl.searchParams.get('status')
  if (status && !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'status inválido' }, { status: 400 })
  }

  let query = supabaseAdmin.from('aquiles_pending_actions').select('*').order('requested_at', { ascending: false })
  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) {
    console.error('[api/admin/aquiles-actions] falha ao listar:', error.message)
    return NextResponse.json({ error: 'Falha ao listar ações' }, { status: 500 })
  }
  return NextResponse.json({ actions: data || [] })
}
