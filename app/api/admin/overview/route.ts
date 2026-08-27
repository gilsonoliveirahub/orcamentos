export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getAuthenticatedAdmin } from '@/lib/admin-auth'
import { getAdminPlanLabel, isTrialEndingSoon, ADMIN_PLAN_LABELS, type AdminPlanLabel } from '@/lib/admin-plan-label'
import { computeConversionRate } from '@/lib/conversion'
import { calcFaturacaoReal } from '@/lib/closed-value-stats'
import { isAbandonedLead } from '@/lib/reliability'
import { buildCalibrationSamples, summarizeCalibration, summarizeCalibrationBySpecialty } from '@/lib/estimate-calibration'

// Visão geral administrativa — corre inteiramente com supabaseAdmin
// (nunca o cliente anon/autenticado do browser). Isto corrige, como efeito
// direto desta migração, um problema real encontrado: a página /admin
// antiga lia `professionals`/`quotes` com o cliente autenticado do admin,
// mas não existe nenhuma policy RLS "admin lê tudo" nessas duas tabelas
// (só existe para `leads`) — só "Public read active professionals"
// (active=true) e "Professional reads own quotes" (dono). Ou seja, o
// admin via sempre profissionais inativos como se não existissem, e a
// tabela `quotes` devolvia sempre vazio (por isso "Calibração da
// Estimativa" nunca tinha amostra e "Valor orçamentos" era sempre ~0) —
// sem nenhum erro visível, porque o código só olhava para `data`, nunca
// para `error`. Não foi preciso mexer em RLS: mover a leitura para uma
// rota admin com service role resolve isto por completo.
export async function GET() {
  const admin = await getAuthenticatedAdmin()
  if (!admin) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

  const [{ data: professionals, error: profError }, { data: leads, error: leadsError }, { data: quotes, error: quotesError }] = await Promise.all([
    supabaseAdmin.from('professionals').select('id, name, specialty, plan, trial_ends_at, created_at'),
    supabaseAdmin.from('leads').select('id, name, status, source, specialty, zone_requested, valor_fechado, created_at, opened_at, professional_id, professionals(name)').order('created_at', { ascending: false }),
    supabaseAdmin.from('quotes').select('lead_id, valor_min, valor_max, valor_final'),
  ])

  if (profError || leadsError || quotesError) {
    return NextResponse.json({ error: (profError || leadsError || quotesError)?.message }, { status: 500 })
  }

  const now = new Date()
  const profs = professionals || []
  const allLeads = leads || []
  const allQuotes = quotes || []

  const byPlan = Object.fromEntries((Object.keys(ADMIN_PLAN_LABELS) as AdminPlanLabel[]).map(k => [k, 0])) as Record<AdminPlanLabel, number>
  for (const p of profs) {
    const label = getAdminPlanLabel({ plan: p.plan as string | null, trial_ends_at: p.trial_ends_at as string | null }, now)
    byPlan[label] += 1
  }

  const todayStr = now.toDateString()
  const novos = allLeads.filter(l => l.status === 'novo')
  const emCurso = allLeads.filter(l => l.status === 'qualificado' || l.status === 'visita')
  const propostas = allLeads.filter(l => l.status === 'proposta')
  const fechados = allLeads.filter(l => l.status === 'fechado')
  const perdidos = allLeads.filter(l => l.status === 'perdido')

  const faturacao = calcFaturacaoReal(fechados)

  const trialsEndingSoon = profs
    .filter(p => isTrialEndingSoon({ plan: p.plan as string | null, trial_ends_at: p.trial_ends_at as string | null }, now))
    .map(p => ({ id: p.id, name: p.name, trial_ends_at: p.trial_ends_at }))

  const abandonedLeads = allLeads.filter(l => isAbandonedLead(l))

  const calibrationSamples = buildCalibrationSamples(allQuotes, allLeads, profs)
  const calibrationOverall = summarizeCalibration(calibrationSamples)
  const calibrationBySpecialty = summarizeCalibrationBySpecialty(calibrationSamples)

  return NextResponse.json({
    professionals: { total: profs.length, byPlan },
    business: {
      totalLeads: allLeads.length,
      leadsHoje: allLeads.filter(l => new Date(l.created_at).toDateString() === todayStr).length,
      novos: novos.length,
      emCurso: emCurso.length,
      propostas: propostas.length,
      fechados: fechados.length,
      perdidos: perdidos.length,
      taxaFecho: computeConversionRate(allLeads),
    },
    value: {
      valorFechadoReal: faturacao.faturacaoReal,
      ticketMedio: faturacao.ticketMedio,
      comValorCount: faturacao.comValorCount,
    },
    alerts: {
      trialsEndingSoon,
      abandonedLeadsCount: abandonedLeads.length,
    },
    calibration: { overall: calibrationOverall, bySpecialty: calibrationBySpecialty },
    recentLeads: allLeads.slice(0, 20).map(l => ({
      id: l.id, name: l.name, status: l.status, specialty: l.specialty, zone_requested: l.zone_requested,
      created_at: l.created_at, professional_name: (l.professionals as unknown as { name: string } | null)?.name ?? null,
    })),
  })
}
