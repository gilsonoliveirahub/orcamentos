// Ordenação de /profissionais (ranking público). Prioridade de plano
// mantém-se intocada (é o modelo de negócio, pro > starter > free) — a
// única mudança é o desempate dentro do mesmo plano: em vez de só
// "mais antigos primeiro", agora primeiro por fiabilidade de processo
// (lib/reliability.ts) e só depois por antiguidade.

export type ProfessionalForRanking = { id: string; plan: string | null; created_at: string }
export type ReliabilityScoresById = Record<string, { score: number; total: number } | undefined>

function planScore(plan: string | null): number {
  return plan === 'pro' ? 3 : plan === 'starter' ? 2 : 1
}

export function sortProfessionalsForRanking<T extends ProfessionalForRanking>(
  professionals: T[],
  scores: ReliabilityScoresById
): T[] {
  // Sem histórico no agregado: score neutro (1) — nunca penaliza quem ainda
  // não teve leads suficientes para ter decidido nada.
  const reliabilityScore = (id: string) => scores?.[id]?.score ?? 1

  return [...professionals].sort((a, b) => {
    const diff = planScore(b.plan) - planScore(a.plan)
    if (diff !== 0) return diff
    const reliabilityDiff = reliabilityScore(b.id) - reliabilityScore(a.id)
    if (reliabilityDiff !== 0) return reliabilityDiff
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })
}
