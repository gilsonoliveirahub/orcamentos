// Valor económico real gerado pelos leads adquiridos no marketplace — só
// para o profissional, com os dados que já existem (leads.valor_fechado,
// status, source, professional_id). Nunca inventa um custo em euros: ver
// LEAD_COST_DATA_GAP para a lacuna real e documentada.

export type LeadForEconomics = {
  source: string | null
  professional_id: string | null
  status: string | null
  valor_fechado?: number | null
}

export type LeadEconomicsSummary = {
  acquiredCount: number
  fechadosCount: number
  totalValueGenerated: number
  avgValuePerAcquired: number | null
  successRate: number | null
}

export function summarizeLeadEconomics(leads: LeadForEconomics[]): LeadEconomicsSummary {
  const acquired = leads.filter(l => l.source === 'marketplace' && l.professional_id !== null)
  const fechados = acquired.filter(l => l.status === 'fechado')
  const totalValueGenerated = fechados.reduce(
    (sum, l) => sum + (typeof l.valor_fechado === 'number' ? l.valor_fechado : 0), 0
  )

  return {
    acquiredCount: acquired.length,
    fechadosCount: fechados.length,
    totalValueGenerated,
    // Divide pelo total adquirido (não só pelos fechados) — mede o retorno
    // médio de "comprar um lead", incluindo os que não geraram nada.
    avgValuePerAcquired: acquired.length > 0 ? totalValueGenerated / acquired.length : null,
    successRate: acquired.length > 0 ? fechados.length / acquired.length : null,
  }
}

/**
 * Custo real por lead adquirido — NÃO calculável hoje.
 * `professionals.marketplace_credits` é só um saldo corrente; não existe
 * nenhum registo histórico de a que preço (entre os 3 pacotes existentes,
 * €1,50–2,00/crédito conforme app/creditos/page.tsx) cada crédito gasto foi
 * comprado. Sem uma tabela de transações de crédito, qualquer "custo deste
 * lead" seria uma suposição apresentada como facto — por isso fica marcado
 * como lacuna em vez de estimado.
 */
export type CostDataGap = { available: false; reason: string }

export const LEAD_COST_DATA_GAP: CostDataGap = {
  available: false,
  reason: 'marketplace_credits é um saldo corrente sem histórico de compra — não é possível reconstruir a que preço (entre os pacotes de €1,50 a €2,00/crédito) um crédito específico gasto num lead foi comprado.',
}
