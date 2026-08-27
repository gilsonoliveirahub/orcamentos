export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getAuthenticatedAdmin } from '@/lib/admin-auth'
import { getAdminPlanLabel, isTrialEndingSoon, type AdminPlanLabel } from '@/lib/admin-plan-label'
import { countActiveLeads } from '@/lib/capacity'

const LIST_FIELDS = 'id, name, email, phone, specialty, specialties, zone, active, slug, plan, trial_ends_at, created_at'

type SortKey = 'name' | 'created_at' | 'active_leads'

// Lista administrativa de profissionais — pesquisa/filtros feitos em memória
// (dataset pequeno, dezenas no máximo) em vez de várias condições SQL
// combinadas, para poder filtrar pelo plano EFETIVO (getAdminPlanLabel, que
// depende de trial_ends_at e da hora atual, não é uma coluna simples de
// comparar em SQL). Contagem de leads ativos por profissional vem de uma
// única query a `leads`, reutilizando countActiveLeads (lib/capacity.ts) —
// nunca uma segunda implementação da mesma regra.
export async function GET(req: NextRequest) {
  const admin = await getAuthenticatedAdmin()
  if (!admin) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') || '').trim().toLowerCase()
  const planFilter = searchParams.get('plan') as AdminPlanLabel | null
  const activeFilter = searchParams.get('active') // 'true' | 'false' | null (=todos)
  const specialtyFilter = searchParams.get('specialty') || ''
  const zoneFilter = (searchParams.get('zone') || '').trim().toLowerCase()
  const expiringSoon = searchParams.get('expiring_soon') === 'true'
  const sort = (searchParams.get('sort') as SortKey) || 'name'

  const { data: professionals, error } = await supabaseAdmin
    .from('professionals')
    .select(LIST_FIELDS)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: leadsData } = await supabaseAdmin
    .from('leads')
    .select('professional_id, status')
    .not('professional_id', 'is', null)

  const leadsByProfessional = new Map<string, Array<{ status: string | null }>>()
  for (const lead of leadsData || []) {
    const pid = lead.professional_id as string
    const list = leadsByProfessional.get(pid) || []
    list.push({ status: lead.status })
    leadsByProfessional.set(pid, list)
  }

  const now = new Date()
  let rows = (professionals || []).map(p => {
    const leads = leadsByProfessional.get(p.id as string) || []
    return {
      ...p,
      effective_plan: getAdminPlanLabel({ plan: p.plan as string | null, trial_ends_at: p.trial_ends_at as string | null }, now),
      active_leads_count: countActiveLeads(leads),
    }
  })

  if (q) {
    rows = rows.filter(p =>
      (p.name as string | null)?.toLowerCase().includes(q) ||
      (p.email as string | null)?.toLowerCase().includes(q)
    )
  }
  if (planFilter) rows = rows.filter(p => p.effective_plan === planFilter)
  if (activeFilter === 'true') rows = rows.filter(p => p.active === true)
  if (activeFilter === 'false') rows = rows.filter(p => p.active === false)
  if (specialtyFilter) {
    rows = rows.filter(p => {
      const specialties = (p.specialties as string[] | null) || []
      return p.specialty === specialtyFilter || specialties.includes(specialtyFilter)
    })
  }
  if (zoneFilter) rows = rows.filter(p => (p.zone as string | null)?.toLowerCase().includes(zoneFilter))
  if (expiringSoon) rows = rows.filter(p => isTrialEndingSoon({ plan: p.plan as string | null, trial_ends_at: p.trial_ends_at as string | null }, now))

  rows.sort((a, b) => {
    if (sort === 'created_at') return new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime()
    if (sort === 'active_leads') return b.active_leads_count - a.active_leads_count
    return (a.name as string || '').localeCompare(b.name as string || '')
  })

  return NextResponse.json({ professionals: rows })
}
