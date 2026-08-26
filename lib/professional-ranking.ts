// Ordenação de /profissionais (ranking público). Prioridade de plano
// mantém-se intocada (é o modelo de negócio, pro > starter > free). Dentro
// do mesmo plano, a ordem de desempate é:
//   1. disponibilidade real (accepting_leads) — pausado nunca à frente de
//      quem está a aceitar, dentro do mesmo plano;
//   2. fiabilidade de processo (lib/reliability.ts);
//   3. capacidade — menos pedidos ativos agora primeiro (lib/capacity.ts),
//      proxy simples de disponibilidade sem nenhum sistema de agenda;
//   4. antiguidade (desempate final, como já era).

export type ProfessionalForRanking = { id: string; plan: string | null; created_at: string; accepting_leads?: boolean | null }
export type ReliabilityScoresById = Record<string, { score: number; total: number; active_count?: number } | undefined>

function planScore(plan: string | null): number {
  return plan === 'pro' ? 3 : plan === 'starter' ? 2 : 1
}

export function sortProfessionalsForRanking<T extends ProfessionalForRanking>(
  professionals: T[],
  scores: ReliabilityScoresById
): T[] {
  // Sem histórico no agregado: score neutro (1) e zero pedidos ativos —
  // nunca penaliza quem ainda não teve leads suficientes para ter dados.
  const reliabilityScore = (id: string) => scores?.[id]?.score ?? 1
  const activeCount = (id: string) => scores?.[id]?.active_count ?? 0
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

    const capacityDiff = activeCount(a.id) - activeCount(b.id)
    if (capacityDiff !== 0) return capacityDiff

    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })
}
