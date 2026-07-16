import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// lib/metrics.ts importa @/lib/supabase-admin no topo do ficheiro. Sem isto,
// o import estático abaixo falharia com "supabaseUrl is required" em
// ambiente de teste. Os testes de computeByProfessional substituem este mock
// com vi.doMock + import dinâmico para controlar o resultado da query.
vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: vi.fn() } }))

import {
  computeTotals,
  computeConversionRates,
  computeEventsByDay,
  computeByOriginChannel,
  computeUniqueVisitors,
  type DailySummaryRow,
  type DailyUniqueVisitorsRow,
} from './metrics'

function row(overrides: Partial<DailySummaryRow>): DailySummaryRow {
  return {
    day: '2026-07-10',
    professional_id: null,
    event_type: 'page_view',
    source: null,
    origin_channel: null,
    event_count: 1,
    unique_visitors: 1,
    ...overrides,
  }
}

describe('computeTotals', () => {
  it('sums event_count per event_type across dimensions (safe to sum)', () => {
    const rows = [
      row({ event_type: 'page_view', event_count: 10, origin_channel: 'instagram' }),
      row({ event_type: 'page_view', event_count: 5, origin_channel: 'facebook' }),
      row({ event_type: 'request_completed', event_count: 2 }),
    ]
    const totals = computeTotals(rows)
    expect(totals.page_view).toBe(15)
    expect(totals.request_completed).toBe(2)
    expect(totals.whatsapp_click).toBe(0)
  })
})

describe('computeConversionRates', () => {
  it('computes ratios safely, avoiding division by zero', () => {
    const totals = { page_view: 100, quote_cta_click: 40, request_started: 30, request_completed: 10, whatsapp_click: 5, email_click: 2 }
    const rates = computeConversionRates(totals)
    expect(rates.view_to_completed).toBeCloseTo(0.1)
    expect(rates.started_to_completed).toBeCloseTo(0.3333, 3)
  })

  it('returns 0 instead of NaN/Infinity when there is no traffic', () => {
    const totals = { page_view: 0, quote_cta_click: 0, request_started: 0, request_completed: 0, whatsapp_click: 0, email_click: 0 }
    const rates = computeConversionRates(totals)
    expect(rates.view_to_completed).toBe(0)
    expect(rates.started_to_completed).toBe(0)
  })
})

describe('computeEventsByDay', () => {
  it('groups and sums by day + event_type', () => {
    const rows = [
      row({ day: '2026-07-10', event_type: 'page_view', event_count: 3, origin_channel: 'instagram' }),
      row({ day: '2026-07-10', event_type: 'page_view', event_count: 2, origin_channel: 'facebook' }),
      row({ day: '2026-07-11', event_type: 'page_view', event_count: 4 }),
    ]
    const result = computeEventsByDay(rows)
    expect(result).toEqual([
      { day: '2026-07-10', event_type: 'page_view', count: 5 },
      { day: '2026-07-11', event_type: 'page_view', count: 4 },
    ])
  })
})

describe('computeByOriginChannel', () => {
  it('only counts page_view events, grouped by channel', () => {
    const rows = [
      row({ event_type: 'page_view', origin_channel: 'instagram', event_count: 7 }),
      row({ event_type: 'page_view', origin_channel: 'instagram', event_count: 3 }),
      row({ event_type: 'whatsapp_click', origin_channel: 'instagram', event_count: 100 }), // ignorado
    ]
    const result = computeByOriginChannel(rows)
    expect(result).toEqual([{ origin_channel: 'instagram', event_count: 10 }])
  })
})

describe('computeUniqueVisitors — nunca soma entre divisões, só entre dias', () => {
  it('returns the daily breakdown untouched, and daily_sum explicitly labeled as a sum across days', () => {
    const rows: DailyUniqueVisitorsRow[] = [
      { day: '2026-07-10', professional_id: 'prof-1', unique_visitors: 5 },
      { day: '2026-07-11', professional_id: 'prof-1', unique_visitors: 8 },
      { day: '2026-07-10', professional_id: null, unique_visitors: 50 }, // linha da plataforma, não deste profissional
    ]
    const { by_day, daily_sum } = computeUniqueVisitors(rows, 'prof-1')
    expect(by_day).toEqual([
      { day: '2026-07-10', unique_visitors: 5 },
      { day: '2026-07-11', unique_visitors: 8 },
    ])
    // A soma dos dias (5+8=13) NÃO é o número real de visitantes únicos do
    // período — pode haver sobreposição entre dias. É exatamente isso que a
    // função deve devolver (soma diária), nunca uma deduplicação inventada.
    expect(daily_sum).toBe(13)
  })

  it('filters strictly by professional_id, never leaking another professional\'s rows', () => {
    const rows: DailyUniqueVisitorsRow[] = [
      { day: '2026-07-10', professional_id: 'prof-1', unique_visitors: 5 },
      { day: '2026-07-10', professional_id: 'prof-2', unique_visitors: 999 },
    ]
    const { daily_sum } = computeUniqueVisitors(rows, 'prof-1')
    expect(daily_sum).toBe(5)
  })

  it('platform total uses professional_id: null rows only', () => {
    const rows: DailyUniqueVisitorsRow[] = [
      { day: '2026-07-10', professional_id: null, unique_visitors: 50 },
      { day: '2026-07-10', professional_id: 'prof-1', unique_visitors: 5 },
    ]
    const { daily_sum } = computeUniqueVisitors(rows, null)
    expect(daily_sum).toBe(50)
  })
})

describe('computeByProfessional', () => {
  const ORIGINAL_ENV = { ...process.env }
  beforeEach(() => vi.resetModules())
  afterEach(() => { process.env = { ...ORIGINAL_ENV }; vi.restoreAllMocks(); vi.doUnmock('@/lib/supabase-admin') })

  it('joins professional attributes and computes conversion per professional', async () => {
    vi.doMock('@/lib/supabase-admin', () => ({
      supabaseAdmin: {
        from: () => ({
          select: () => ({
            in: () => Promise.resolve({
              data: [{ id: 'prof-1', name: 'Ana Pintora', specialty: 'Pintura', zone: 'Lisboa', plan: 'pro' }],
            }),
          }),
        }),
      },
    }))
    const { computeByProfessional } = await import('./metrics')

    const summaryRows: DailySummaryRow[] = [
      row({ professional_id: 'prof-1', event_type: 'page_view', event_count: 20 }),
      row({ professional_id: 'prof-1', event_type: 'request_completed', event_count: 2 }),
    ]
    const uniqueRows: DailyUniqueVisitorsRow[] = [
      { day: '2026-07-10', professional_id: 'prof-1', unique_visitors: 12 },
    ]

    const result = await computeByProfessional(summaryRows, uniqueRows)
    expect(result).toEqual([
      expect.objectContaining({
        professional_id: 'prof-1',
        name: 'Ana Pintora',
        specialty: 'Pintura',
        zone: 'Lisboa',
        plan: 'pro',
        page_view: 20,
        request_completed: 2,
        unique_visitors_daily_sum: 12,
        conversion_rate: 0.1,
      }),
    ])
  })

  it('excludes rows with professional_id null (métricas globais da plataforma, não de nenhum profissional)', async () => {
    vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: () => ({ select: () => ({ in: () => Promise.resolve({ data: [] }) }) }) } }))
    const { computeByProfessional } = await import('./metrics')

    const summaryRows: DailySummaryRow[] = [row({ professional_id: null, event_type: 'request_completed', event_count: 1 })]
    const result = await computeByProfessional(summaryRows, [])
    expect(result).toEqual([])
  })
})
