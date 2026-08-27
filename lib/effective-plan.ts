// Fonte de verdade única para "que permissões efetivas tem este profissional
// agora", combinando o plano realmente subscrito (coluna `plan`) com o
// trial de 7 dias. Decisão de negócio aprovada:
//
//   pro (pago)                                  → pro
//   starter (pago)                              → starter
//   inactive (cancelado/pagamento falhado)       → inactive (nunca conta como pago)
//   free/null + trial_ends_at no futuro          → starter (equivalente, nunca pro)
//   free/null + trial expirado ou sem trial      → free
//
// Nunca escreve nem sugere escrever 'starter' na coluna `plan` — o trial
// continua tecnicamente `plan: 'free'` na base de dados; esta função só
// decide, em memória, que permissões se aplicam neste momento. Qualquer
// gate novo de plano/permissões deve passar por aqui em vez de reimplementar
// a sua própria condição — é exatamente essa duplicação que este ficheiro
// existe para eliminar.

export type EffectivePlan = 'free' | 'starter' | 'pro' | 'inactive'

export type PlanInput = { plan: string | null | undefined; trial_ends_at?: string | null }

export function getEffectivePlan(prof: PlanInput, now: Date = new Date()): EffectivePlan {
  const plan = prof.plan
  if (plan === 'pro') return 'pro'
  if (plan === 'starter') return 'starter'
  if (plan === 'inactive') return 'inactive'
  // plan é null ou 'free' a partir daqui.
  if (prof.trial_ends_at && new Date(prof.trial_ends_at).getTime() > now.getTime()) return 'starter'
  return 'free'
}

// Acesso "pago" para NOVAS ações comerciais (adquirir marketplace, abrir
// novo lead do link pessoal, ver cartões desbloqueados no dashboard, etc.).
// 'inactive' nunca conta como pago aqui, mesmo tendo pago no passado —
// acesso a leads já adquiridos/abertos é decidido à parte, por lead
// (ver lib/lead-authorization.ts), nunca por este helper.
export function isPaidEffective(effective: EffectivePlan): boolean {
  return effective === 'starter' || effective === 'pro'
}

// Funcionalidades exclusivas do plano Pro real (follow-up automático,
// notificações WhatsApp, estatísticas avançadas). O trial nunca satisfaz
// isto, mesmo sendo funcionalmente equivalente a Starter — decisão de
// negócio explícita ("o trial NÃO dá acesso às funcionalidades exclusivas
// do Pro").
export function isProEffective(effective: EffectivePlan): boolean {
  return effective === 'pro'
}
