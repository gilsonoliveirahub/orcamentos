export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import {
  fetchMetricsRows,
  computeTotals,
  computeConversionRates,
  computeEventsByDay,
  computeByOriginChannel,
  computeUniqueVisitors,
  computeByProfessional,
} from '@/lib/metrics'

async function getAuthenticatedAdmin() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: admin } = await supabaseAdmin
    .from('admins')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!admin) return null

  return user
}

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

    return NextResponse.json({
      totals,
      conversion,
      events_by_day,
      by_origin_channel,
      unique_visitors_platform: platformUnique, // null quando filtrado por profissional — ver by_professional
      by_professional,
      note: 'unique_visitors_daily_sum é a soma dos visitantes únicos aproximados de cada dia — pode contar a mesma pessoa em dias diferentes.',
    })
  } catch (err) {
    console.error('[api/admin/metrics] erro:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Falha ao calcular métricas' }, { status: 500 })
  }
}
