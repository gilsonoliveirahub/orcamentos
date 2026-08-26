import { describe, it, expect } from 'vitest'
import { getPeriodWindow, getPreviousPeriodWindow, computePeriodBalance, comparePeriods } from './period-balance'

const NOW = new Date('2026-08-26T12:00:00Z')

describe('getPeriodWindow / getPreviousPeriodWindow', () => {
  it('semana: janelas de 7 dias corridos, consecutivas e sem sobreposição', () => {
    const curr = getPeriodWindow('semana', NOW)
    const prev = getPreviousPeriodWindow('semana', NOW)
    expect((curr.end.getTime() - curr.start.getTime()) / 86400000).toBe(7)
    expect((prev.end.getTime() - prev.start.getTime()) / 86400000).toBe(7)
    expect(prev.end.getTime()).toBe(curr.start.getTime())
  })

  it('mes/ano usam 30/365 dias corridos', () => {
    expect((getPeriodWindow('mes', NOW).end.getTime() - getPeriodWindow('mes', NOW).start.getTime()) / 86400000).toBe(30)
    expect((getPeriodWindow('ano', NOW).end.getTime() - getPeriodWindow('ano', NOW).start.getTime()) / 86400000).toBe(365)
  })
})

describe('computePeriodBalance', () => {
  const window = getPeriodWindow('semana', NOW) // últimos 7 dias antes de NOW

  it('sem leads: tudo a zero, conversionRate null (sem leads criados no período)', () => {
    expect(computePeriodBalance([], window)).toEqual({ fechados: 0, faturacaoReal: 0, ticketMedio: 0, totalLeads: 0, conversionRate: null })
  })

  it('conta fechados pelo updated_at (data de fecho), não pelo created_at', () => {
    const leads = [
      // criado há 60 dias, mas só fechado (updated_at) dentro da janela -> conta como fechado do período
      { created_at: '2026-06-01T00:00:00Z', updated_at: '2026-08-24T00:00:00Z', status: 'fechado', valor_fechado: 500 },
    ]
    const result = computePeriodBalance(leads, window)
    expect(result.fechados).toBe(1)
    expect(result.faturacaoReal).toBe(500)
    // totalLeads (por created_at) não inclui este lead, pois foi criado fora da janela
    expect(result.totalLeads).toBe(0)
  })

  it('ticket médio só considera fechados com valor_fechado informado', () => {
    const leads = [
      { created_at: '2026-08-24T00:00:00Z', updated_at: '2026-08-24T00:00:00Z', status: 'fechado', valor_fechado: 400 },
      { created_at: '2026-08-24T00:00:00Z', updated_at: '2026-08-24T00:00:00Z', status: 'fechado', valor_fechado: null },
    ]
    const result = computePeriodBalance(leads, window)
    expect(result.fechados).toBe(2)
    expect(result.faturacaoReal).toBe(400)
    expect(result.ticketMedio).toBe(400)
  })

  it('conversionRate = fechados no período / total de leads criados no período', () => {
    const leads = [
      { created_at: '2026-08-24T00:00:00Z', updated_at: '2026-08-24T00:00:00Z', status: 'fechado', valor_fechado: 100 },
      { created_at: '2026-08-24T00:00:00Z', updated_at: null, status: 'novo', valor_fechado: null },
      { created_at: '2026-08-24T00:00:00Z', updated_at: null, status: 'perdido', valor_fechado: null },
      { created_at: '2026-08-24T00:00:00Z', updated_at: null, status: 'proposta', valor_fechado: null },
    ]
    expect(computePeriodBalance(leads, window).conversionRate).toBe(0.25)
  })

  it('leads fora da janela (created_at e updated_at) não contam para nada', () => {
    const leads = [{ created_at: '2020-01-01T00:00:00Z', updated_at: '2020-01-01T00:00:00Z', status: 'fechado', valor_fechado: 999 }]
    expect(computePeriodBalance(leads, window)).toEqual({ fechados: 0, faturacaoReal: 0, ticketMedio: 0, totalLeads: 0, conversionRate: null })
  })
})

describe('comparePeriods', () => {
  it('delta null quando o período anterior não teve nenhuma base (nunca divide por zero)', () => {
    const leads = [{ created_at: '2026-08-24T00:00:00Z', updated_at: '2026-08-24T00:00:00Z', status: 'fechado', valor_fechado: 500 }]
    const cmp = comparePeriods(leads, 'semana', NOW)
    expect(cmp.current.fechados).toBe(1)
    expect(cmp.previous.fechados).toBe(0)
    expect(cmp.deltaPercent.fechados).toBeNull()
    expect(cmp.deltaPercent.faturacaoReal).toBeNull()
  })

  it('calcula a percentagem de variação corretamente quando há base no período anterior', () => {
    const leads = [
      { created_at: '2026-08-24T00:00:00Z', updated_at: '2026-08-24T00:00:00Z', status: 'fechado', valor_fechado: 200 }, // semana atual
      { created_at: '2026-08-15T00:00:00Z', updated_at: '2026-08-15T00:00:00Z', status: 'fechado', valor_fechado: 100 }, // semana anterior
    ]
    const cmp = comparePeriods(leads, 'semana', NOW)
    expect(cmp.current.faturacaoReal).toBe(200)
    expect(cmp.previous.faturacaoReal).toBe(100)
    expect(cmp.deltaPercent.faturacaoReal).toBe(100) // +100%
  })
})
