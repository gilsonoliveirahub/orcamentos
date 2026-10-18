// Fonte única dos Price IDs Stripe e da resolução plano+ciclo → Price ID,
// partilhada por app/api/stripe/checkout e app/api/stripe/webhook — nunca
// duplicar estes IDs noutro sítio.
//
// Preços novos (2026-10-18, aprovados pelo proprietário): Starter 29€+IVA
// e Pro 59€+IVA por mês (antes 19€/39€); anual recalculado mantendo os
// mesmos -15% sobre o mensal NOVO (antes era -15% sobre o mensal antigo) —
// 295,80€/601,80€ por ano (antes 193,80€/397,80€). Os 4 Price IDs novos
// vêm de variáveis de ambiente (criados por Gilson diretamente no Stripe,
// 2026-10-18) — nunca inventados aqui; sem a env var, `resolvePriceId`
// devolve `null` (ver checkout/route.ts: erro claro, nunca cai no preço
// antigo nem inventa um ID).
//
// Os 4 Price IDs ANTIGOS (2 mensais, 2 anuais) ficam aqui só como
// "legacy" — nunca usados para checkouts novos (ver resolvePriceId), só
// para `classifyPriceId` continuar a reconhecer quem já tinha subscrição
// nesses preços antes desta mudança (webhook/reconciliação — "compras
// antigas pendentes são processadas segundo as condições da compra
// original", subscrições existentes preservadas sem qualquer alteração).

export type PlanTier = 'starter' | 'pro'
export type BillingCycle = 'monthly' | 'annual'

const LEGACY_MONTHLY_PRICE_IDS: Record<PlanTier, string> = {
  starter: 'price_1TPAO4LFTn4mze6d70qkDWAj',
  pro: 'price_1TPAOELFTn4mze6dDaYx6snk',
}

function legacyAnnualPriceIds(): Record<PlanTier, string | undefined> {
  return {
    starter: process.env.STRIPE_PRICE_STARTER_ANNUAL,
    pro: process.env.STRIPE_PRICE_PRO_ANNUAL,
  }
}

function newMonthlyPriceIds(): Record<PlanTier, string | undefined> {
  return {
    starter: process.env.STRIPE_PRICE_STARTER_MONTHLY_2026,
    pro: process.env.STRIPE_PRICE_PRO_MONTHLY_2026,
  }
}

function newAnnualPriceIds(): Record<PlanTier, string | undefined> {
  return {
    starter: process.env.STRIPE_PRICE_STARTER_ANNUAL_2026,
    pro: process.env.STRIPE_PRICE_PRO_ANNUAL_2026,
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
 * lista fechada, nunca aceita um Price ID vindo do pedido. Só devolve
 * preços NOVOS (2026-10-18) — os antigos nunca são oferecidos a uma
 * contratação nova, só continuam reconhecidos por `classifyPriceId` para
 * quem já estava subscrito. Sem a variável de ambiente configurada,
 * devolve `null` (o chamador tem de tratar isso como erro explícito,
 * nunca cair silenciosamente noutro preço).
 */
export function resolvePriceId(plan: PlanTier, cycle: BillingCycle): string | null {
  if (cycle === 'monthly') return newMonthlyPriceIds()[plan] ?? null
  return newAnnualPriceIds()[plan] ?? null
}

/**
 * Inverso de resolvePriceId — a partir de um Price ID real (vindo sempre do
 * Stripe, nunca do cliente), devolve a que plano+ciclo corresponde. Usado
 * pelo webhook para classificar tanto subscrições NOVAS (preços
 * 2026-10-18) como ANTIGAS (preços legacy, de quem já estava subscrito
 * antes desta mudança).
 */
export function classifyPriceId(priceId: string | null | undefined): { plan: PlanTier; cycle: BillingCycle } | null {
  if (!priceId) return null
  for (const plan of ['starter', 'pro'] as const) {
    if (LEGACY_MONTHLY_PRICE_IDS[plan] === priceId) return { plan, cycle: 'monthly' }
  }
  const newMonthly = newMonthlyPriceIds()
  for (const plan of ['starter', 'pro'] as const) {
    if (newMonthly[plan] && newMonthly[plan] === priceId) return { plan, cycle: 'monthly' }
  }
  const legacyAnnual = legacyAnnualPriceIds()
  for (const plan of ['starter', 'pro'] as const) {
    if (legacyAnnual[plan] && legacyAnnual[plan] === priceId) return { plan, cycle: 'annual' }
  }
  const newAnnual = newAnnualPriceIds()
  for (const plan of ['starter', 'pro'] as const) {
    if (newAnnual[plan] && newAnnual[plan] === priceId) return { plan, cycle: 'annual' }
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

// Proteção contra dupla subscrição (2026-09-19, decisão de negócio do
// Gilson): a reconciliação em app/api/stripe/checkout NUNCA pode verificar
// só `status: 'active'` — uma subscrição trialing/past_due/unpaid/incomplete
// já é uma subscrição real no Stripe (já existe, já pode gerar cobrança) e
// tem de ser encontrada antes de criar uma segunda. Só 'canceled' e
// 'incomplete_expired' contam como verdadeiramente terminadas — tudo o
// resto conta para efeitos de "já existe uma subscrição para este cliente".
const NON_TERMINAL_SUBSCRIPTION_STATUSES = new Set([
  'trialing', 'active', 'past_due', 'unpaid', 'incomplete', 'paused',
])

export function isNonTerminalSubscriptionStatus(status: string | null | undefined): boolean {
  return !!status && NON_TERMINAL_SUBSCRIPTION_STATUSES.has(status)
}
