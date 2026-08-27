export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getAuthenticatedAdmin } from '@/lib/admin-auth'
import { getAdminLeadAccessState, type AdminLeadAccessState } from '@/lib/admin-lead-access-state'
import { isAbandonedLead } from '@/lib/reliability'

const LIST_FIELDS = 'id, name, phone, email, status, source, specialty, zone_requested, professional_id, created_at, opened_at, locked, valor_fechado, professionals(name, specialty, zone)'

// Vista administrativa global de leads/pedidos — nunca substitui nem altera
// o fluxo do profissional (dashboard_leads(), lead_is_authorized, etc.):
// esta rota corre com supabaseAdmin (bypassa RLS, como qualquer rota admin
// já existente) só para LEITURA agregada. Filtros aplicados em memória
// (dataset pequeno) porque combinam colunas simples com estados derivados
// (access_state, abandoned) que não são colunas — nunca reimplementados
// aqui, vêm de lib/admin-lead-access-state.ts e lib/reliability.ts.
export async function GET(req: NextRequest) {
  const admin = await getAuthenticatedAdmin()
  if (!admin) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const status = searchParams.get('status')
  const source = searchParams.get('source')
  const specialty = searchParams.get('specialty')
  const zone = (searchParams.get('zone') || '').trim().toLowerCase()
  const professionalId = searchParams.get('professional_id')
  const accessState = searchParams.get('access_state') as AdminLeadAccessState | null
  const abandonedOnly = searchParams.get('abandoned') === 'true'
  const q = (searchParams.get('q') || '').trim().toLowerCase()

  let query = supabaseAdmin.from('leads').select(LIST_FIELDS).order('created_at', { ascending: false })
  if (from) query = query.gte('created_at', from)
  if (to) query = query.lte('created_at', to)
  if (status) {
    // Aceita uma lista separada por vírgulas (ex: "qualificado,visita" para
    // representar "em curso" na Visão Geral) além de um único estado.
    const statuses = status.split(',').map(s => s.trim()).filter(Boolean)
    query = statuses.length > 1 ? query.in('status', statuses) : query.eq('status', statuses[0])
  }
  if (source) query = query.eq('source', source)
  if (specialty) query = query.eq('specialty', specialty)
  if (professionalId) query = query.eq('professional_id', professionalId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let rows = (data || []).map(l => ({
    ...l,
    access_state: getAdminLeadAccessState(l),
    abandoned: isAbandonedLead(l),
  }))

  if (zone) rows = rows.filter(l => (l.zone_requested as string | null)?.toLowerCase().includes(zone))
  if (accessState) rows = rows.filter(l => l.access_state === accessState)
  if (abandonedOnly) rows = rows.filter(l => l.abandoned)
  if (q) {
    rows = rows.filter(l =>
      (l.name as string | null)?.toLowerCase().includes(q) ||
      (l.phone as string | null)?.toLowerCase().includes(q) ||
      (l.email as string | null)?.toLowerCase().includes(q)
    )
  }

  return NextResponse.json({ leads: rows })
}
