// Ordenação de /profissionais (ranking público). Prioridade de plano
// mantém-se intocada (é o modelo de negócio, pro > starter > free). Dentro
// do mesmo plano, a ordem de desempate é:
//   1. disponibilidade real (accepting_leads) — pausado nunca à frente de
//      quem está a aceitar, dentro do mesmo plano;
//   2. fiabilidade de processo (lib/reliability.ts) — chega a uma conclusão?
//   3. conversão (lib/conversion.ts) — essa conclusão costuma ser trabalho
//      ganho, ou perde-se quase sempre?
//   4. velocidade de resposta (lib/conversion.ts) — quem costuma abrir o
//      pedido mais depressa;
//   5. capacidade — menos pedidos ativos agora primeiro (lib/capacity.ts),
//      proxy simples de disponibilidade sem nenhum sistema de agenda;
//   6. proximidade ao cliente (lib/geo.ts), só quando há localização
//      disponível — nunca substitui os critérios acima, só desempata
//      dentro deles quando ainda estão empatados;
//   7. antiguidade (desempate final, como já era).

export type ProfessionalForRanking = { id: string; plan: string | null; created_at: string; accepting_leads?: boolean | null }
export type ReliabilityScoresById = Record<string, {
  score: number
  total: number
  active_count?: number
  conversion_rate?: number
  avg_response_hours?: number | null
} | undefined>

function planScore(plan: string | null): number {
  return plan === 'pro' ? 3 : plan === 'starter' ? 2 : 1
}

// Distância aproximada (km) por id de profissional — calculada pelo
// chamador (geocodeZone do cliente vs. geocodeZone(prof.zone), ver
// lib/geo.ts) só quando a localização do cliente está disponível.
// Ausente/null = sem dado, nunca compara pior nem melhor (mesma filosofia
// dos restantes critérios desta função).
export type DistancesById = Record<string, number | null | undefined>

export function sortProfessionalsForRanking<T extends ProfessionalForRanking>(
  professionals: T[],
  scores: ReliabilityScoresById,
  distances?: DistancesById
): T[] {
  // Sem histórico no agregado: neutro em tudo — nunca penaliza quem ainda
  // não teve leads suficientes para ter dados.
  const reliabilityScore = (id: string) => scores?.[id]?.score ?? 1
  const conversionRate = (id: string) => scores?.[id]?.conversion_rate ?? 1
  const activeCount = (id: string) => scores?.[id]?.active_count ?? 0
  // null/undefined = sem dado de velocidade — nunca compara pior nem melhor.
  const responseHours = (id: string) => scores?.[id]?.avg_response_hours ?? null
  // undefined/null (coluna ainda por migrar ou nunca definida) conta sempre
  // como disponível — nunca penaliza por omissão.
  const isAccepting = (p: T) => p.accepting_leads !== false

  return [...professionals].sort((a, b) => {
    const planDiff = planScore(b.plan) - planScore(a.plan)
    if (planDiff !== 0) return planDiff

    const acceptingDiff = Number(isAccepting(b)) - Number(isAccepting(a))
    if (acceptingDiff !== 0) return acceptingDiff

    const reliabilityDiff = reliabilityScore(b.id) - reliabilityScore(a.id)
    if (reliabilityDiff !== 0) return reliabilityDiff

    const conversionDiff = conversionRate(b.id) - conversionRate(a.id)
    if (conversionDiff !== 0) return conversionDiff

    const rA = responseHours(a.id)
    const rB = responseHours(b.id)
    if (rA !== null && rB !== null && rA !== rB) return rA - rB

    const capacityDiff = activeCount(a.id) - activeCount(b.id)
    if (capacityDiff !== 0) return capacityDiff

    const distA = distances?.[a.id]
    const distB = distances?.[b.id]
    if (distA != null && distB != null && distA !== distB) return distA - distB

    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })
}
