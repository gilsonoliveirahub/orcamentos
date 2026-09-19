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

export interface ActiveSubscriptionStatus {
  plan: string | null
  cycle: BillingCycle | null
}

/**
 * Bug real corrigido (2026-09-19, achado pelo Gilson em produção): o
 * cartão "Plano atual" em app/upgrade decidia isto só pelo tier guardado em
 * `professionals.plan` — ignorava por completo o ciclo, por isso Pro
 * mensal aparecia "ATIVO" mesmo com o seletor em Anual, impedindo abrir o
 * checkout do Pro anual. `status.cycle` vem sempre de uma leitura real ao
 * Stripe (app/api/stripe/subscription-status), nunca inventado a partir do
 * tier — quando é `null` (sem subscrição Stripe identificável, ver
 * classifyPriceId), esta função devolve sempre `false`: nunca bloqueia a
 * escolha de nenhum ciclo só porque a BD diz que a conta "tem" aquele tier.
 */
export function isActivePlanCycle(
  status: ActiveSubscriptionStatus | null | undefined,
  plan: PlanTier,
  cycle: BillingCycle
): boolean {
  if (!status || status.cycle === null) return false
  return status.plan === plan && status.cycle === cycle
}

// Estado simplificado para mostrar ao profissional (app/perfil, app/upgrade,
// app/dashboard) — reduz os ~8 valores que sub.status do Stripe pode ter
// (active, trialing, past_due, unpaid, canceled, incomplete,
// incomplete_expired, paused) aos 5 que a interface distingue. `null`
// (sem stripe_subscription_id de todo) é sempre 'no_subscription' — nunca
// confundir com 'canceled', que implica ter havido uma subscrição real.
// 'admin_access' nunca vem daqui — é atribuído por resolveUnbilledStatus,
// abaixo, só quando não há subscrição identificável.
export type SimplifiedSubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'no_subscription' | 'admin_access' | 'unknown'

export function simplifySubscriptionStatus(stripeStatus: string | null | undefined): SimplifiedSubscriptionStatus {
  if (!stripeStatus) return 'no_subscription'
  if (stripeStatus === 'active' || stripeStatus === 'trialing') return 'active'
  if (stripeStatus === 'past_due' || stripeStatus === 'unpaid') return 'past_due'
  if (stripeStatus === 'canceled' || stripeStatus === 'incomplete_expired') return 'canceled'
  return 'unknown'
}

// Acesso administrativo (2026-09-19): confirmado por leitura em produção
// (2026-09-19) que a conta do Gilson tem `plan: 'pro'` e nenhuma
// subscrição Stripe, que o seu user_id está na tabela `admins`, e que não
// há nenhum registo em `admin_audit_log` a explicar essa alteração (o
// endpoint do painel de admin nem permite editar `plan` — ver
// app/api/admin/professionals/[id]/route.ts) — o mais consistente com uma
// atribuição manual, ligada ao seu acesso de administrador. É também a
// ÚNICA conta em produção com um tier pago sem subscrição identificável;
// não há nenhum profissional normal nesse estado, por isso esta distinção
// nunca esconde uma inconsistência real de outra conta. Um profissional
// normal (isAdmin=false) na mesma situação continua 'no_subscription' —
// tratado como estado inconsistente, nunca como acesso administrativo.
export function resolveUnbilledStatus(isAdmin: boolean, plan: string | null | undefined): 'admin_access' | 'no_subscription' {
  if (isAdmin && (plan === 'starter' || plan === 'pro')) return 'admin_access'
  return 'no_subscription'
}
