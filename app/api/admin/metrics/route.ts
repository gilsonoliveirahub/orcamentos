export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getAuthenticatedAdmin } from '@/lib/admin-auth'
import {
  fetchMetricsRows,
  computeTotals,
  computeConversionRates,
  computeEventsByDay,
  computeByOriginChannel,
  computeUniqueVisitors,
  computeUniqueVisitorsProfilesSum,
  computeByProfessional,
  computeProfilesTotals,
  fetchNullProfessionalBucketTotals,
  fetchUtmCampaignTotals,
} from '@/lib/metrics'

export async function GET(req: NextRequest) {
  const admin = await getAuthenticatedAdmin()
  if (!admin) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from') || undefined
  const to = searchParams.get('to') || undefined
  const professionalId = searchParams.get('professional_id') || undefined
  const specialty = searchParams.get('specialty') || undefined
  const zone = searchParams.get('zone') || undefined
  const plan = searchParams.get('plan') || undefined
  const sourceParam = searchParams.get('source') || undefined
  const source = sourceParam === 'pessoal' || sourceParam === 'marketplace' ? sourceParam : undefined

  try {
    // Resolve o conjunto de profissionais a filtrar, se algum filtro de
    // especialidade/zona/plano/profissional foi pedido. null = sem restrição
    // (métricas globais, incluindo eventos sem profissional associado).
    let professionalIds: string[] | null = null
    if (specialty || zone || plan || professionalId) {
      let q = supabaseAdmin.from('professionals').select('id')
      if (specialty) q = q.eq('specialty', specialty)
      if (zone) q = q.eq('zone', zone)
      if (plan) q = q.eq('plan', plan)
      if (professionalId) q = q.eq('id', professionalId)
      const { data } = await q
      professionalIds = (data || []).map(p => p.id)
    }

    const { summaryRows, uniqueRows } = await fetchMetricsRows({ from, to, professionalIds, source })

    const totals = computeTotals(summaryRows)
    const conversion = computeConversionRates(totals)
    const events_by_day = computeEventsByDay(summaryRows)
    const by_origin_channel = computeByOriginChannel(summaryRows)
    // Total de visitantes únicos da plataforma: só faz sentido sem filtro de
    // profissional (professional_id null nas linhas de analytics_daily_unique_visitors).
    // Quando há filtro por profissional(is), devolve-se antes a soma por profissional.
    const platformUnique = professionalIds ? null : computeUniqueVisitors(uniqueRows, null)
    const by_professional = await computeByProfessional(summaryRows, uniqueRows)
    const perfis_publicos = { ...computeProfilesTotals(summaryRows), unique_visitors: professionalIds ? null : computeUniqueVisitorsProfilesSum(uniqueRows) }
    // Área profissional (captação) vs site geral — só fazem sentido sem
    // filtro de profissional (são sempre tráfego sem professional_id) e lêem
    // analytics_events em bruto (ver fetchNullProfessionalBucketTotals).
    const nullProfessionalBuckets = professionalIds ? null : await fetchNullProfessionalBucketTotals({ from, to })
    // Campanhas (utm_campaign) — respeita o mesmo filtro de profissional(is)
    // já resolvido acima, ao contrário dos blocos área profissional/site
    // (que só fazem sentido sem filtro, por serem sempre tráfego sem
    // professional_id). Uma campanha paga pode apontar para um perfil
    // específico, por isso não faz sentido restringir isto a "sem filtro".
    const by_utm_campaign = await fetchUtmCampaignTotals({ from, to, professionalIds })

    return NextResponse.json({
      totals,
      conversion,
      events_by_day,
      by_origin_channel,
      unique_visitors_platform: platformUnique, // null quando filtrado por profissional — ver by_professional
      perfis_publicos, // /p/[slug] — clientes a consultar um profissional específico
      area_profissional: nullProfessionalBuckets?.area_profissional ?? null, // /comecar, /juntar, /exclusivo, registo de profissional
      site: nullProfessionalBuckets?.site ?? null, // páginas gerais + registo de cliente
      by_professional,
      by_utm_campaign, // ver lib/metrics.ts fetchUtmCampaignTotals — só cobre a retenção de 90 dias de analytics_events
      note: 'unique_visitors_daily_sum e os unique_visitors dos blocos são aproximados — podem contar a mesma pessoa mais de uma vez (dias diferentes, ou profissionais/páginas diferentes visitados pela mesma pessoa).',
    })
  } catch (err) {
    console.error('[api/admin/metrics] erro:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Falha ao calcular métricas' }, { status: 500 })
  }
}
