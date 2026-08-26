// Velocidade de resposta e conversão — duas métricas reais e distintas da
// fiabilidade (lib/reliability.ts, que só mede "chega a uma conclusão?"):
// aqui interessa se essa conclusão é normalmente um trabalho ganho
// (conversão) e quanto tempo o profissional demora a sequer abrir o pedido
// (resposta). Nenhum dado novo — tudo a partir de leads.status/created_at/
// opened_at, já existentes.

export type LeadForConversion = { status: string | null }
export type LeadForResponseTime = { created_at: string; opened_at: string | null }

/**
 * fechados / (fechados + perdidos) — só entre os leads já decididos, nunca
 * conta os que ainda estão em aberto (esses ainda não tiveram oportunidade
 * de virar trabalho nem de se perder). Sem nenhum lead decidido ainda,
 * devolve 1 (neutro) — mesma filosofia de lib/reliability.ts: nunca
 * penaliza quem não teve histórico suficiente.
 */
export function computeConversionRate(leads: LeadForConversion[]): number {
  let fechados = 0
  let perdidos = 0
  for (const lead of leads) {
    if (lead.status === 'fechado') fechados += 1
    else if (lead.status === 'perdido') perdidos += 1
  }
  const decided = fechados + perdidos
  return decided === 0 ? 1 : fechados / decided
}

/**
 * Tempo médio (em horas) entre created_at e opened_at, só sobre os leads
 * que já foram efetivamente abertos (opened_at presente) — leads do
 * marketplace nunca têm opened_at (autorizam por aquisição, não por
 * abertura) e ficam de fora, não penalizados por não terem esse campo.
 * Sem nenhum dado, devolve null (sem informação, não é o mesmo que "rápido").
 */
export function computeAvgResponseHours(leads: LeadForResponseTime[]): number | null {
  const diffsHours: number[] = []
  for (const lead of leads) {
    if (!lead.opened_at) continue
    const diffMs = new Date(lead.opened_at).getTime() - new Date(lead.created_at).getTime()
    if (diffMs >= 0) diffsHours.push(diffMs / 3600000)
  }
  if (diffsHours.length === 0) return null
  return diffsHours.reduce((sum, h) => sum + h, 0) / diffsHours.length
}
