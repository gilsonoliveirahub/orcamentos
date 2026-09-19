// Planos anuais (2026-09-19): fonte única dos Price IDs Stripe e da
// resolução plano+ciclo → Price ID, partilhada por app/api/stripe/checkout
// e app/api/stripe/webhook — nunca duplicar estes IDs noutro sítio (mesmo
// motivo já documentado antes só para o Pro mensal).
//
// Os 2 Price IDs mensais continuam FIXOS no código (como sempre estiveram,
// nunca vieram de env var) — já em produção, não inventados agora. Os 2
// Price IDs anuais vêm de variáveis de ambiente (criados por Gilson
// diretamente no Stripe, 2026-09-19) — nunca inventados aqui; sem a env
// var, `resolvePriceId` devolve null (ver checkout/route.ts: erro claro,
// nunca cai no mensal).

export type PlanTier = 'starter' | 'pro'
export type BillingCycle = 'monthly' | 'annual'

const MONTHLY_PRICE_IDS: Record<PlanTier, string> = {
  starter: 'price_1TPAO4LFTn4mze6d70qkDWAj',
  pro: 'price_1TPAOELFTn4mze6dDaYx6snk',
}

function annualPriceIds(): Record<PlanTier, string | undefined> {
  return {
    starter: process.env.STRIPE_PRICE_STARTER_ANNUAL,
    pro: process.env.STRIPE_PRICE_PRO_ANNUAL,
  }
}

export function isPlanTier(value: unknown): value is PlanTier {
  return value === 'starter' || value === 'pro'
}

export function isBillingCycle(value: unknown): value is BillingCycle {
  return value === 'monthly' || value === 'annual'
}

/**
 * Único ponto que decide qual Price ID usar para um par (plano, ciclo) —
 * lista fechada, nunca aceita um Price ID vindo do pedido. Sem a variável
 * de ambiente do anual configurada, devolve `null` (o chamador tem de
 * tratar isso como erro explícito, nunca cair silenciosamente no mensal).
 */
export function resolvePriceId(plan: PlanTier, cycle: BillingCycle): string | null {
  if (cycle === 'monthly') return MONTHLY_PRICE_IDS[plan]
  return annualPriceIds()[plan] ?? null
}

/**
 * Inverso de resolvePriceId — a partir de um Price ID real (vindo sempre do
 * Stripe, nunca do cliente), devolve a que plano+ciclo corresponde. Usado
 * pelo webhook para nunca depender de comparar só o Price ID do Pro mensal
 * (como acontecia antes de existir o anual) — cobre os 4 preços sempre a
 * partir da mesma fonte que o checkout usa para os criar.
 */
export function classifyPriceId(priceId: string | null | undefined): { plan: PlanTier; cycle: BillingCycle } | null {
  if (!priceId) return null
  for (const plan of ['starter', 'pro'] as const) {
    if (MONTHLY_PRICE_IDS[plan] === priceId) return { plan, cycle: 'monthly' }
  }
  const annual = annualPriceIds()
  for (const plan of ['starter', 'pro'] as const) {
    if (annual[plan] && annual[plan] === priceId) return { plan, cycle: 'annual' }
  }
  return null
}

// Starter < Pro — usado só para decidir a direção (upgrade/downgrade) de
// quem já tem subscrição ativa; independente do ciclo (mudar só o ciclo,
// mesmo plano, nunca conta como upgrade nem downgrade de tier).
export const PLAN_RANK: Record<PlanTier, number> = { starter: 1, pro: 2 }
