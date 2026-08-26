// Lembrete discreto de processos por finalizar — decide só QUANDO mostrar
// (cooldown depois de dispensado), nunca o que conta como "por finalizar"
// (isso já existe: lib/reliability.ts, isAbandonedLead — leads em aberto há
// mais de 30 dias). Nunca bloqueia nada, só um banner dispensável.

export const REMINDER_COOLDOWN_DAYS = 7

export function shouldShowStaleLeadsReminder(params: {
  staleCount: number
  dismissedAt: number | null
  now?: number
}): boolean {
  const now = params.now ?? Date.now()
  if (params.staleCount <= 0) return false
  if (params.dismissedAt === null) return true
  const daysSinceDismiss = (now - params.dismissedAt) / 86400000
  return daysSinceDismiss >= REMINDER_COOLDOWN_DAYS
}
