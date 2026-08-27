export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getAuthenticatedAdmin } from '@/lib/admin-auth'
import { getEffectivePlan } from '@/lib/effective-plan'
import { computeReliabilityScore, isAbandonedLead } from '@/lib/reliability'
import { computeConversionRate, computeAvgResponseHours } from '@/lib/conversion'
import { countActiveLeads } from '@/lib/capacity'
import { calcFaturacaoReal } from '@/lib/closed-value-stats'

// Campos que um admin tem permissão para alterar no perfil de outro
// profissional. Nunca inclui email (login), password, user_id, nem
// nada relacionado com Stripe/subscrições.
const EDITABLE_FIELDS = ['name', 'phone', 'specialties', 'zone', 'description', 'active'] as const
type EditableField = typeof EDITABLE_FIELDS[number]

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAuthenticatedAdmin()
  if (!admin) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Corpo do pedido inválido' }, { status: 400 })
  }

  const updates: Partial<Record<EditableField, unknown>> = {}
  for (const field of EDITABLE_FIELDS) {
    if (field in body) updates[field] = (body as Record<string, unknown>)[field]
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nenhum campo válido para atualizar' }, { status: 400 })
  }

  const selectFields = EDITABLE_FIELDS.join(',')

  const { data: before, error: beforeError } = await supabaseAdmin
    .from('professionals')
    .select(selectFields)
    .eq('id', id)
    .single()

  if (beforeError || !before) {
    return NextResponse.json({ error: 'Profissional não encontrado' }, { status: 404 })
  }

  const { data: after, error: updateError } = await supabaseAdmin
    .from('professionals')
    .update(updates)
    .eq('id', id)
    .select(selectFields)
    .single()

  if (updateError || !after) {
    return NextResponse.json({ error: updateError?.message || 'Falha ao atualizar' }, { status: 500 })
  }

  const beforeRecord = before as unknown as Record<string, unknown>
  const afterRecord = after as unknown as Record<string, unknown>
  const changes: Record<string, { before: unknown; after: unknown }> = {}
  for (const field of Object.keys(updates)) {
    changes[field] = { before: beforeRecord[field], after: afterRecord[field] }
  }

  const { error: auditError } = await supabaseAdmin.from('admin_audit_log').insert({
    admin_id: admin.id,
    professional_id: id,
    changes,
  })
  if (auditError) {
    console.error(`[admin/professionals] falha ao registar auditoria (admin ${admin.id}, profissional ${id}): ${auditError.message}`)
  }

  return NextResponse.json({ professional: after })
}

const PROFESSIONAL_FICHA_FIELDS = 'id, name, email, phone, specialty, specialties, zone, active, slug, plan, trial_ends_at, current_period_start, current_period_end, pending_plan, marketplace_credits, stripe_customer_id, stripe_subscription_id, accepting_leads, created_at'

// Ficha administrativa: identificação + plano/subscrição (dados diretos da
// tabela) + atividade/desempenho (reutiliza lib/reliability, lib/conversion,
// lib/capacity, lib/closed-value-stats — os mesmos cálculos já usados no
// dashboard do próprio profissional e no ranking público, nunca uma versão
// nova) + histórico (admin_audit_log real, nunca uma timeline inventada).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAuthenticatedAdmin()
  if (!admin) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

  const { id } = await params

  const { data: professional, error: profError } = await supabaseAdmin
    .from('professionals')
    .select(PROFESSIONAL_FICHA_FIELDS)
    .eq('id', id)
    .single()

  if (profError || !professional) {
    return NextResponse.json({ error: 'Profissional não encontrado' }, { status: 404 })
  }

  const { data: leadsData } = await supabaseAdmin
    .from('leads')
    .select('id, source, status, created_at, opened_at, valor_fechado')
    .eq('professional_id', id)

  const leads = leadsData || []
  const fechados = leads.filter(l => l.status === 'fechado')
  const perdidos = leads.filter(l => l.status === 'perdido')
  const reliability = computeReliabilityScore(leads)
  const faturacao = calcFaturacaoReal(fechados)

  const { data: auditRows } = await supabaseAdmin
    .from('admin_audit_log')
    .select('id, admin_id, changes, created_at')
    .eq('professional_id', id)
    .order('created_at', { ascending: false })

  const adminIds = Array.from(new Set((auditRows || []).map(r => r.admin_id).filter(Boolean)))
  let adminEmailById: Record<string, string> = {}
  if (adminIds.length > 0) {
    const { data: adminsData } = await supabaseAdmin.from('admins').select('user_id, email').in('user_id', adminIds)
    adminEmailById = Object.fromEntries((adminsData || []).map(a => [a.user_id, a.email]))
  }

  const prof = professional as unknown as Record<string, unknown>

  return NextResponse.json({
    professional,
    effective_plan: getEffectivePlan({ plan: prof.plan as string | null, trial_ends_at: prof.trial_ends_at as string | null }),
    activity: {
      leadsPersonalCount: leads.filter(l => l.source === 'pessoal').length,
      leadsMarketplaceCount: leads.filter(l => l.source === 'marketplace').length,
      activeCount: countActiveLeads(leads),
      fechadosCount: fechados.length,
      perdidosCount: perdidos.length,
      abandonedCount: leads.filter(l => isAbandonedLead(l)).length,
      totalCount: leads.length,
    },
    performance: {
      reliability,
      conversionRate: computeConversionRate(leads),
      avgResponseHours: computeAvgResponseHours(leads),
      faturacaoReal: faturacao.faturacaoReal,
      ticketMedio: faturacao.ticketMedio,
      comValorCount: faturacao.comValorCount,
    },
    history: (auditRows || []).map(row => ({
      id: row.id,
      created_at: row.created_at,
      admin_email: adminEmailById[row.admin_id as string] || null,
      changes: row.changes,
    })),
  })
}
