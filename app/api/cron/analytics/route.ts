export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

const EVENTS_RETENTION_DAYS = 90
const SUMMARY_RETENTION_MONTHS = 24

// Cron próprio do sistema de métricas — deliberadamente separado do
// /api/followup (que trata de leads/notificações, um domínio diferente).
// Corre diariamente às 04:00 (ver vercel.json).
//
// Ao contrário do /api/followup, aqui exige-se SEMPRE um CRON_SECRET válido
// (nunca permite passar sem segredo configurado) porque esta rota apaga
// dados em massa — um CRON_SECRET em falta não pode significar "sem
// proteção", tem de significar "rota indisponível".
function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return false
  const header = req.headers.get('authorization') || req.headers.get('x-cron-secret') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : header
  return token === cronSecret
}

function isoDateDaysAgo(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString()
}

function dateOnlyMonthsAgo(months: number): string {
  const d = new Date()
  d.setUTCMonth(d.getUTCMonth() - months)
  return d.toISOString().slice(0, 10)
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const yesterday = new Date()
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  const targetDay = yesterday.toISOString().slice(0, 10)

  const results: {
    day: string
    summary_aggregated: boolean
    unique_visitors_aggregated: boolean
    events_deleted: number
    summary_deleted: number
    unique_visitors_deleted: number
  } = {
    day: targetDay,
    summary_aggregated: false,
    unique_visitors_aggregated: false,
    events_deleted: 0,
    summary_deleted: 0,
    unique_visitors_deleted: 0,
  }

  // Agregação do dia anterior — as duas funções fazem DELETE+INSERT desse
  // dia dentro de uma transação SQL, por isso correr o cron duas vezes para
  // o mesmo dia não duplica nenhuma contagem (idempotente).
  const { error: aggError } = await supabaseAdmin.rpc('aggregate_analytics_day', { target_day: targetDay })
  if (aggError) {
    console.error(`[cron/analytics] falha ao agregar resumo diário (${targetDay}): ${aggError.message}`)
  }
  results.summary_aggregated = !aggError

  const { error: uvError } = await supabaseAdmin.rpc('aggregate_analytics_unique_visitors_day', { target_day: targetDay })
  if (uvError) {
    console.error(`[cron/analytics] falha ao agregar visitantes únicos (${targetDay}): ${uvError.message}`)
  }
  results.unique_visitors_aggregated = !uvError

  // Retenção — só este processo pode apagar eventos/agregados. Nenhuma rota
  // pública tem UPDATE ou DELETE sobre estas tabelas.
  const eventsCutoff = isoDateDaysAgo(EVENTS_RETENTION_DAYS)
  const { error: eventsDeleteError, count: eventsDeleted } = await supabaseAdmin
    .from('analytics_events')
    .delete({ count: 'exact' })
    .lt('created_at', eventsCutoff)
  if (eventsDeleteError) {
    console.error(`[cron/analytics] falha ao apagar eventos antigos: ${eventsDeleteError.message}`)
  }
  results.events_deleted = eventsDeleted ?? 0

  const summaryCutoffDay = dateOnlyMonthsAgo(SUMMARY_RETENTION_MONTHS)

  const { error: summaryDeleteError, count: summaryDeleted } = await supabaseAdmin
    .from('analytics_daily_summary')
    .delete({ count: 'exact' })
    .lt('day', summaryCutoffDay)
  if (summaryDeleteError) {
    console.error(`[cron/analytics] falha ao apagar resumos antigos: ${summaryDeleteError.message}`)
  }
  results.summary_deleted = summaryDeleted ?? 0

  const { error: uvDeleteError, count: uvDeleted } = await supabaseAdmin
    .from('analytics_daily_unique_visitors')
    .delete({ count: 'exact' })
    .lt('day', summaryCutoffDay)
  if (uvDeleteError) {
    console.error(`[cron/analytics] falha ao apagar visitantes únicos antigos: ${uvDeleteError.message}`)
  }
  results.unique_visitors_deleted = uvDeleted ?? 0

  return NextResponse.json({ success: true, ...results })
}
