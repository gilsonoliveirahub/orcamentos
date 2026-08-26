// "Lead → Proposta" — não há histórico de transições de estado gravado
// (leads.status é só o estado atual, sem log), por isso não é possível
// reconstruir com certeza se um lead "passou" por proposta antes de ficar
// fechado/perdido. O proxy real e verificável que já existe: uma linha em
// `quotes` para esse lead_id significa que uma proposta foi de facto
// gerada — é o artefacto concreto do produto, não uma aproximação.

export type LeadForFunnel = { id: string }
export type QuoteForFunnel = { lead_id: string }

export type ProposalRate = { rate: number | null; withQuote: number; total: number }

export function computeProposalRate(leads: LeadForFunnel[], quotes: QuoteForFunnel[]): ProposalRate {
  const leadIdsWithQuote = new Set(quotes.map(q => q.lead_id))
  const withQuote = leads.filter(l => leadIdsWithQuote.has(l.id)).length
  return {
    rate: leads.length > 0 ? withQuote / leads.length : null,
    withQuote,
    total: leads.length,
  }
}
