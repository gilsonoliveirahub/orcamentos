// Faturação real e ticket médio a partir de leads.valor_fechado — nunca cai
// para a estimativa de `quotes` (valor_min/valor_max) nem mistura os dois.
// Trabalhos fechados com "Prefiro não indicar" (valor_fechado null/ausente)
// ficam de fora dos dois cálculos monetários, mas contam para o total de
// fechados usado no indicador de cobertura.

export type FechadoComValor = { valor_fechado?: number | null }

export type FaturacaoRealStats = {
  faturacaoReal: number
  ticketMedio: number
  comValorCount: number
  totalFechados: number
}

export function calcFaturacaoReal(fechados: FechadoComValor[]): FaturacaoRealStats {
  const comValor = fechados.filter(
    (l): l is { valor_fechado: number } => typeof l.valor_fechado === 'number' && l.valor_fechado > 0
  )
  const faturacaoReal = comValor.reduce((sum, l) => sum + l.valor_fechado, 0)
  const ticketMedio = comValor.length > 0 ? Math.round(faturacaoReal / comValor.length) : 0

  return {
    faturacaoReal,
    ticketMedio,
    comValorCount: comValor.length,
    totalFechados: fechados.length,
  }
}

// Evolução mensal do valor fechado real — para o painel Financeiro. Usa
// updated_at como aproximação da data de fecho (não existe closed_at),
// exatamente a mesma convenção já estabelecida em lib/period-balance.ts
// (computePeriodBalance) para "fechados no período"; nunca uma segunda
// definição de "quando é que um lead fechou".
export type LeadForMonthlyFaturacao = { status: string | null; updated_at: string | null; created_at: string; valor_fechado?: number | null }
export type MonthlyFaturacao = { month: string; total: number; count: number }

export function groupFaturacaoRealByMonth(leads: LeadForMonthlyFaturacao[]): MonthlyFaturacao[] {
  const byMonth = new Map<string, { total: number; count: number }>()
  for (const lead of leads) {
    if (lead.status !== 'fechado') continue
    if (typeof lead.valor_fechado !== 'number' || lead.valor_fechado <= 0) continue
    const month = (lead.updated_at || lead.created_at).slice(0, 7) // "YYYY-MM"
    const entry = byMonth.get(month) || { total: 0, count: 0 }
    entry.total += lead.valor_fechado
    entry.count += 1
    byMonth.set(month, entry)
  }
  return Array.from(byMonth.entries())
    .map(([month, v]) => ({ month, ...v }))
    .sort((a, b) => a.month.localeCompare(b.month))
}
