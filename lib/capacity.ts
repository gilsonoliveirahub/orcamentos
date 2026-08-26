// Sinal de capacidade real — quantos pedidos um profissional tem
// atualmente em aberto (não fechados nem perdidos). Não é o mesmo que
// fiabilidade (lib/reliability.ts, que mede se o processo chega a uma
// conclusão): aqui interessa só o volume de trabalho ativo agora, como
// proxy simples de "tem mesmo capacidade para mais um pedido?" sem
// construir nenhum sistema de agenda/horários.

const RESOLVED_STATUSES = new Set(['fechado', 'perdido'])

export type LeadForCapacity = { status: string | null }

export function countActiveLeads(leads: LeadForCapacity[]): number {
  return leads.filter(l => !(l.status && RESOLVED_STATUSES.has(l.status))).length
}
