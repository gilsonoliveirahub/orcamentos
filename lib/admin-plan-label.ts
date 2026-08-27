// Rótulo administrativo do plano — só para exibição/filtro no CRM interno,
// nunca para decidir permissões (isso continua a ser lib/effective-plan.ts,
// que nunca deve ser alterado por causa disto). getEffectivePlan() devolve
// 'starter' tanto para uma subscrição Starter real como para um trial
// ativo (mesmas permissões), o que é correto para gates de acesso mas
// esconderia do admin quem está em trial vs quem já paga. Este helper só
// acrescenta essa distinção visual, usando exatamente a mesma condição de
// trial já definida em getEffectivePlan (nunca reimplementada em separado).

export type AdminPlanLabel = 'free' | 'trial' | 'starter' | 'pro' | 'inactive'

export type AdminPlanInput = { plan: string | null | undefined; trial_ends_at?: string | null }

export function getAdminPlanLabel(prof: AdminPlanInput, now: Date = new Date()): AdminPlanLabel {
  const plan = prof.plan
  if (plan === 'pro') return 'pro'
  if (plan === 'starter') return 'starter'
  if (plan === 'inactive') return 'inactive'
  // plan é null ou 'free' a partir daqui — mesma condição de trial usada em
  // getEffectivePlan, só que aqui devolve 'trial' em vez de 'starter'.
  if (prof.trial_ends_at && new Date(prof.trial_ends_at).getTime() > now.getTime()) return 'trial'
  return 'free'
}

export const ADMIN_PLAN_LABELS: Record<AdminPlanLabel, string> = {
  free: 'Free',
  trial: 'Trial',
  starter: 'Starter',
  pro: 'Pro',
  inactive: 'Inactive',
}
