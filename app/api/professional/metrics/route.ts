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
} from '@/lib/metrics'

// Devolve o id do profissional autenticado — nunca aceita professional_id
// vindo do pedido do cliente. Um profissional só pode consultar as suas
// próprias métricas, resolvido sempre a partir da sessão.
async function getAuthenticatedProfessionalId(): Promise<string | null> {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: professional } = await supabaseAdmin
    .from('professionals')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  return professional?.id ?? null
}

export async function GET(req: NextRequest) {
  const professionalId = await getAuthenticatedProfessionalId()
  if (!professionalId) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from') || undefined
  const to = searchParams.get('to') || undefined

  try {
    const { summaryRows, uniqueRows } = await fetchMetricsRows({
      from,
      to,
      professionalIds: [professionalId], // sempre restringe ao próprio, mesmo que o pedido tente outra coisa
    })

    const totals = computeTotals(summaryRows)
    const conversion = computeConversionRates(totals)
    const events_by_day = computeEventsByDay(summaryRows)
    const by_origin_channel = computeByOriginChannel(summaryRows)
    const unique_visitors = computeUniqueVisitors(uniqueRows, professionalId)

    return NextResponse.json({
      totals,
      conversion,
      events_by_day,
      by_origin_channel,
      unique_visitors,
      note: 'unique_visitors.daily_sum é a soma dos visitantes únicos aproximados de cada dia — pode contar a mesma pessoa em dias diferentes.',
    })
  } catch (err) {
    console.error('[api/professional/metrics] erro:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Falha ao calcular métricas' }, { status: 500 })
  }
}
