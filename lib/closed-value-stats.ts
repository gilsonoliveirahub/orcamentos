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
