// Desempenho por grupo (especialidade/tipo de trabalho, origem...) — nunca
// mostra um grupo com amostra insuficiente para não fingir precisão que os
// dados não têm (ex: 1 lead fechado em 1 pedido não é "100% de conversão",
// é ruído). Reutilizável para qualquer critério de agrupamento via keyFn.

export const MIN_SAMPLE_SIZE = 3

export type LeadForPerformance = { status: string | null; valor_fechado?: number | null }

export type GroupPerformance = {
  label: string
  total: number
  fechados: number
  conversionRate: number
  faturacaoReal: number
}

export function groupPerformance<T extends LeadForPerformance>(
  leads: T[],
  keyFn: (lead: T) => string,
  minSample: number = MIN_SAMPLE_SIZE
): GroupPerformance[] {
  const groups = new Map<string, T[]>()
  for (const lead of leads) {
    const key = keyFn(lead)
    const list = groups.get(key) ?? []
    list.push(lead)
    groups.set(key, list)
  }

  const result: GroupPerformance[] = []
  for (const [label, groupLeads] of groups) {
    if (groupLeads.length < minSample) continue
    const fechados = groupLeads.filter(l => l.status === 'fechado')
    const faturacaoReal = fechados.reduce(
      (sum, l) => sum + (typeof l.valor_fechado === 'number' ? l.valor_fechado : 0), 0
    )
    result.push({
      label,
      total: groupLeads.length,
      fechados: fechados.length,
      conversionRate: fechados.length / groupLeads.length,
      faturacaoReal,
    })
  }

  return result.sort((a, b) => b.total - a.total)
}
