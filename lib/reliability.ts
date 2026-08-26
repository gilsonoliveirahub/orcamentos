// Fiabilidade de processo — usa só campos que já existem em `leads`
// (status, created_at), nada de tracking novo. Mede se o profissional leva
// os pedidos a um estado terminal (fechado/perdido) ou os deixa por resolver
// indefinidamente ("abandono"), nunca a qualidade do trabalho em si (isso já
// é medido pelas `reviews`, um sinal diferente).
//
// Um lead recente ainda "em aberto" não conta contra ninguém — só passa a
// contar como abandonado depois de ABANDONED_THRESHOLD_DAYS sem chegar a
// fechado/perdido. Sem histórico suficiente (nenhum lead decidido ainda),
// o score fica neutro (1) — nunca penaliza quem ainda não teve oportunidade
// de mostrar o processo, isso seria uma punição arbitrária.

export const ABANDONED_THRESHOLD_DAYS = 30

const RESOLVED_STATUSES = new Set(['fechado', 'perdido'])

export type LeadForReliability = { status: string | null; created_at: string }

export type ReliabilityScore = {
  score: number // 0..1, mais alto = mais fiável
  resolved: number
  abandoned: number
  pending: number // ainda em aberto mas dentro do prazo normal — não conta
  total: number
}

export function isAbandonedLead(lead: LeadForReliability, now: Date = new Date()): boolean {
  if (lead.status && RESOLVED_STATUSES.has(lead.status)) return false
  const ageDays = (now.getTime() - new Date(lead.created_at).getTime()) / 86400000
  return ageDays > ABANDONED_THRESHOLD_DAYS
}

export function computeReliabilityScore(leads: LeadForReliability[], now: Date = new Date()): ReliabilityScore {
  let resolved = 0
  let abandoned = 0
  let pending = 0

  for (const lead of leads) {
    if (lead.status && RESOLVED_STATUSES.has(lead.status)) {
      resolved += 1
    } else if (isAbandonedLead(lead, now)) {
      abandoned += 1
    } else {
      pending += 1
    }
  }

  const decided = resolved + abandoned
  const score = decided === 0 ? 1 : resolved / decided

  return { score, resolved, abandoned, pending, total: leads.length }
}
