import { supabaseAdmin } from '@/lib/supabase-admin'
import { EVENT_TYPES, type AnalyticsEventType } from '@/lib/analytics'

export type DailySummaryRow = {
  day: string
  professional_id: string | null
  event_type: string
  source: string | null
  origin_channel: string | null
  event_count: number
  unique_visitors: number
}

export type DailyUniqueVisitorsRow = {
  day: string
  professional_id: string | null
  unique_visitors: number
}

export type MetricsFilters = {
  from?: string
  to?: string
  professionalIds?: string[] | null // null = sem restrição (só admin); array = restringe a esses ids
  source?: 'pessoal' | 'marketplace'
}

export async function fetchMetricsRows(filters: MetricsFilters): Promise<{
  summaryRows: DailySummaryRow[]
  uniqueRows: DailyUniqueVisitorsRow[]
}> {
  let summaryQuery = supabaseAdmin.from('analytics_daily_summary').select('*')
  if (filters.from) summaryQuery = summaryQuery.gte('day', filters.from)
  if (filters.to) summaryQuery = summaryQuery.lte('day', filters.to)
  if (filters.source) summaryQuery = summaryQuery.eq('source', filters.source)
  if (filters.professionalIds) summaryQuery = summaryQuery.in('professional_id', filters.professionalIds)
  const { data: summaryRows, error: summaryError } = await summaryQuery
  if (summaryError) throw new Error(summaryError.message)

  let uniqueQuery = supabaseAdmin.from('analytics_daily_unique_visitors').select('*')
  if (filters.from) uniqueQuery = uniqueQuery.gte('day', filters.from)
  if (filters.to) uniqueQuery = uniqueQuery.lte('day', filters.to)
  if (filters.professionalIds) uniqueQuery = uniqueQuery.in('professional_id', filters.professionalIds)
  const { data: uniqueRows, error: uniqueError } = await uniqueQuery
  if (uniqueError) throw new Error(uniqueError.message)

  return { summaryRows: (summaryRows as DailySummaryRow[]) || [], uniqueRows: (uniqueRows as DailyUniqueVisitorsRow[]) || [] }
}

/** Soma event_count por tipo de evento. Seguro somar — não é contagem de visitantes. */
export function computeTotals(rows: DailySummaryRow[]): Record<AnalyticsEventType, number> {
  const totals = Object.fromEntries(EVENT_TYPES.map(t => [t, 0])) as Record<AnalyticsEventType, number>
  for (const row of rows) {
    if ((EVENT_TYPES as readonly string[]).includes(row.event_type)) {
      totals[row.event_type as AnalyticsEventType] += row.event_count
    }
  }
  return totals
}

export function computeConversionRates(totals: Record<AnalyticsEventType, number>) {
  const safe = (num: number, den: number) => (den > 0 ? Number((num / den).toFixed(4)) : 0)
  return {
    view_to_started: safe(totals.request_started, totals.page_view),
    started_to_completed: safe(totals.request_completed, totals.request_started),
    view_to_completed: safe(totals.request_completed, totals.page_view),
  }
}

export function computeEventsByDay(rows: DailySummaryRow[]): Array<{ day: string; event_type: string; count: number }> {
  const map = new Map<string, number>()
  for (const row of rows) {
    const key = `${row.day}::${row.event_type}`
    map.set(key, (map.get(key) || 0) + row.event_count)
  }
  return Array.from(map.entries())
    .map(([key, count]) => {
      const [day, event_type] = key.split('::')
      return { day, event_type, count }
    })
    .sort((a, b) => a.day.localeCompare(b.day))
}

/** Origem das visitas — baseada em page_view, que é o evento de chegada. */
export function computeByOriginChannel(rows: DailySummaryRow[]): Array<{ origin_channel: string; event_count: number }> {
  const map = new Map<string, number>()
  for (const row of rows) {
    if (row.event_type !== 'page_view') continue
    const channel = row.origin_channel || 'outro'
    map.set(channel, (map.get(channel) || 0) + row.event_count)
  }
  return Array.from(map.entries())
    .map(([origin_channel, event_count]) => ({ origin_channel, event_count }))
    .sort((a, b) => b.event_count - a.event_count)
}

/**
 * "Visitantes únicos aproximados por dia" — nunca uma dedução do período
 * inteiro. Para intervalos com mais de um dia, o valor devolvido em
 * `daily_sum` é explicitamente a SOMA dos totais diários, o que pode contar
 * a mesma pessoa mais de uma vez em dias diferentes — nunca apresentar como
 * "visitantes únicos do período".
 */
export function computeUniqueVisitors(rows: DailyUniqueVisitorsRow[], professionalId: string | null) {
  const filtered = rows.filter(r => r.professional_id === professionalId)
  const by_day = filtered
    .map(r => ({ day: r.day, unique_visitors: r.unique_visitors }))
    .sort((a, b) => a.day.localeCompare(b.day))
  const daily_sum = filtered.reduce((sum, r) => sum + r.unique_visitors, 0)
  return { by_day, daily_sum }
}

export type ProfessionalRanking = {
  professional_id: string
  name: string
  specialty: string | null
  zone: string | null
  plan: string | null
  page_view: number
  quote_cta_click: number
  request_started: number
  request_completed: number
  whatsapp_click: number
  email_click: number
  unique_visitors_daily_sum: number
  conversion_rate: number // request_completed / page_view
}

export async function computeByProfessional(
  summaryRows: DailySummaryRow[],
  uniqueRows: DailyUniqueVisitorsRow[]
): Promise<ProfessionalRanking[]> {
  const ids = Array.from(new Set(summaryRows.map(r => r.professional_id).filter((id): id is string => !!id)))
  if (ids.length === 0) return []

  const { data: professionals } = await supabaseAdmin
    .from('professionals')
    .select('id, name, specialty, zone, plan')
    .in('id', ids)

  const profMap = new Map((professionals || []).map(p => [p.id, p]))

  const perProfessional = new Map<string, Record<AnalyticsEventType, number>>()
  for (const row of summaryRows) {
    if (!row.professional_id) continue
    if (!(EVENT_TYPES as readonly string[]).includes(row.event_type)) continue
    const existing = perProfessional.get(row.professional_id) || (Object.fromEntries(EVENT_TYPES.map(t => [t, 0])) as Record<AnalyticsEventType, number>)
    existing[row.event_type as AnalyticsEventType] += row.event_count
    perProfessional.set(row.professional_id, existing)
  }

  const uniqueByProfessional = new Map<string, number>()
  for (const row of uniqueRows) {
    if (!row.professional_id) continue
    uniqueByProfessional.set(row.professional_id, (uniqueByProfessional.get(row.professional_id) || 0) + row.unique_visitors)
  }

  return ids.map(id => {
    const counts = perProfessional.get(id) || (Object.fromEntries(EVENT_TYPES.map(t => [t, 0])) as Record<AnalyticsEventType, number>)
    const prof = profMap.get(id)
    const conversion = counts.page_view > 0 ? Number((counts.request_completed / counts.page_view).toFixed(4)) : 0
    return {
      professional_id: id,
      name: prof?.name || '—',
      specialty: prof?.specialty ?? null,
      zone: prof?.zone ?? null,
      plan: prof?.plan ?? null,
      page_view: counts.page_view,
      quote_cta_click: counts.quote_cta_click,
      request_started: counts.request_started,
      request_completed: counts.request_completed,
      whatsapp_click: counts.whatsapp_click,
      email_click: counts.email_click,
      unique_visitors_daily_sum: uniqueByProfessional.get(id) || 0,
      conversion_rate: conversion,
    }
  }).sort((a, b) => b.page_view - a.page_view)
}
