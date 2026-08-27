export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getAuthenticatedAdmin } from '@/lib/admin-auth'
import { getAdminLeadAccessState } from '@/lib/admin-lead-access-state'

const DETAIL_FIELDS = `
  id, name, phone, email, status, source, specialty, zone_requested, lat, lng,
  professional_id, created_at, updated_at, opened_at, locked, valor_fechado,
  current_question, metadata,
  q1_tipo_trabalho, q2_divisoes, q3_area_m2, q4_cor_escura, q5_fissuras,
  q6_mobilias, q7_primer, q8_teto, q9_prazo, q10_orcamentos_anteriores,
  q11_fotos_url, q12_notas,
  professionals(id, name, email, phone, specialty, zone, slug)
`

// Detalhe administrativo de um lead — leitura completa (nome/telefone/
// respostas/fotos/proposta), nunca ações de escrita sobre o fluxo do
// profissional (sem PATCH aqui: mudar estado continua exclusivo de
// /api/leads/status, com as suas próprias regras de autorização e envio de
// email). supabaseAdmin porque o admin precisa de ver o pedido
// independentemente de já estar "autorizado" para o profissional dono.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAuthenticatedAdmin()
  if (!admin) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

  const { id } = await params

  const { data: lead, error } = await supabaseAdmin
    .from('leads')
    .select(DETAIL_FIELDS)
    .eq('id', id)
    .single()

  if (error || !lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })

  const { data: quotes } = await supabaseAdmin
    .from('quotes')
    .select('id, area_m2, valor_base, extras_total, valor_final, valor_min, valor_max, proposal_text, status, sent_at, created_at')
    .eq('lead_id', id)
    .order('created_at', { ascending: false })

  const leadRecord = lead as unknown as { phone: string | null }
  let client: { id: string; name: string; email: string | null } | null = null
  if (leadRecord.phone) {
    const { data: clientRow } = await supabaseAdmin
      .from('clients')
      .select('id, name, email')
      .eq('phone', leadRecord.phone)
      .maybeSingle()
    client = clientRow
  }

  return NextResponse.json({
    lead,
    access_state: getAdminLeadAccessState(lead as unknown as { source: string | null; opened_at: string | null; professional_id: string | null }),
    quotes: quotes || [],
    client, // conta de login associada por telefone, se existir (a maioria dos clientes não tem)
  })
}
