// Balanço do profissional por período — reaproveita exatamente os campos já
// usados no resto de Stats (status, created_at, updated_at, valor_fechado),
// só olhando para uma janela de tempo em vez do histórico completo.
//
// Janelas sempre por dias corridos (últimos 7/30/365), nunca por
// calendário — uma "semana" alinhada ao calendário a meio da semana teria
// menos dias que a anterior, distorcendo a comparação. Dias corridos
// mantém as duas janelas sempre do mesmo tamanho.
//
// "Fechados" no período usa updated_at (o momento em que o lead passou a
// fechado é a melhor aproximação disponível a uma data de fecho real — não
// existe closed_at). "Total de leads" no período usa created_at (quando o
// pedido chegou). Um lead pode ter sido criado antes do período e fechado
// dentro dele — é a razão de "manter os leads atualizados" ter impacto
// direto no balanço: só conta como conversão do período o que for
// realmente marcado como fechado dentro dessa janela.

export type Period = 'semana' | 'mes' | 'ano'

const PERIOD_DAYS: Record<Period, number> = { semana: 7, mes: 30, ano: 365 }

export type Window = { start: Date; end: Date }

export function getPeriodWindow(period: Period, reference: Date = new Date()): Window {
  const days = PERIOD_DAYS[period]
  const end = reference
  const start = new Date(end.getTime() - days * 86400000)
  return { start, end }
}

export function getPreviousPeriodWindow(period: Period, reference: Date = new Date()): Window {
  const days = PERIOD_DAYS[period]
  const end = new Date(reference.getTime() - days * 86400000)
  const start = new Date(end.getTime() - days * 86400000)
  return { start, end }
}

export type LeadForPeriodBalance = {
  created_at: string
  updated_at: string | null
  status: string | null
  valor_fechado?: number | null
}

export type PeriodBalance = {
  fechados: number
  faturacaoReal: number
  ticketMedio: number
  totalLeads: number
  conversionRate: number | null
}

function inWindow(dateStr: string, window: Window): boolean {
  const t = new Date(dateStr).getTime()
  return t >= window.start.getTime() && t <= window.end.getTime()
}

export function computePeriodBalance(leads: LeadForPeriodBalance[], window: Window): PeriodBalance {
  const totalLeads = leads.filter(l => inWindow(l.created_at, window)).length
  const fechadosNoPeriodo = leads.filter(l => l.status === 'fechado' && inWindow(l.updated_at || l.created_at, window))
  const comValor = fechadosNoPeriodo.filter((l): l is typeof l & { valor_fechado: number } =>
    typeof l.valor_fechado === 'number' && l.valor_fechado > 0
  )
  const faturacaoReal = comValor.reduce((sum, l) => sum + l.valor_fechado, 0)

  return {
    fechados: fechadosNoPeriodo.length,
    faturacaoReal,
    ticketMedio: comValor.length > 0 ? Math.round(faturacaoReal / comValor.length) : 0,
    totalLeads,
    conversionRate: totalLeads > 0 ? fechadosNoPeriodo.length / totalLeads : null,
  }
}

export type PeriodComparison = {
  current: PeriodBalance
  previous: PeriodBalance
  // null quando o período anterior não tem base para comparar (nunca uma
  // percentagem inventada a dividir por zero).
  deltaPercent: { fechados: number | null; faturacaoReal: number | null; ticketMedio: number | null }
}

function delta(curr: number, prev: number): number | null {
  if (prev === 0) return null
  return ((curr - prev) / prev) * 100
}

export function comparePeriods(leads: LeadForPeriodBalance[], period: Period, reference: Date = new Date()): PeriodComparison {
  const current = computePeriodBalance(leads, getPeriodWindow(period, reference))
  const previous = computePeriodBalance(leads, getPreviousPeriodWindow(period, reference))
  return {
    current,
    previous,
    deltaPercent: {
      fechados: delta(current.fechados, previous.fechados),
      faturacaoReal: delta(current.faturacaoReal, previous.faturacaoReal),
      ticketMedio: delta(current.ticketMedio, previous.ticketMedio),
    },
  }
}
