import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { resolvePriceId, classifyPriceId, isPlanTier, isBillingCycle, PLAN_RANK, isActivePlanCycle, simplifySubscriptionStatus, resolveUnbilledStatus } from './stripe-plans'

const ORIGINAL_ENV = { ...process.env }
const STARTER_MONTHLY = 'price_1TPAO4LFTn4mze6d70qkDWAj'
const PRO_MONTHLY = 'price_1TPAOELFTn4mze6dDaYx6snk'
const STARTER_ANNUAL = 'price_1UHAsXLFTn4mze6dU5uk5YkJ'
const PRO_ANNUAL = 'price_1UHAuTLFTn4mze6d29nsPNiC'

describe('resolvePriceId — lista fechada, 4 pares plano/ciclo', () => {
  beforeEach(() => { process.env = { ...ORIGINAL_ENV } })
  afterEach(() => { process.env = { ...ORIGINAL_ENV } })

  it('mensal: sempre os Price IDs fixos, independente de env vars', () => {
    expect(resolvePriceId('starter', 'monthly')).toBe(STARTER_MONTHLY)
    expect(resolvePriceId('pro', 'monthly')).toBe(PRO_MONTHLY)
  })

  it('anual: lê da env var quando configurada', () => {
    process.env.STRIPE_PRICE_STARTER_ANNUAL = STARTER_ANNUAL
    process.env.STRIPE_PRICE_PRO_ANNUAL = PRO_ANNUAL
    expect(resolvePriceId('starter', 'annual')).toBe(STARTER_ANNUAL)
    expect(resolvePriceId('pro', 'annual')).toBe(PRO_ANNUAL)
  })

  it('anual sem env var configurada: devolve null, nunca cai no mensal nem inventa um ID', () => {
    delete process.env.STRIPE_PRICE_STARTER_ANNUAL
    delete process.env.STRIPE_PRICE_PRO_ANNUAL
    expect(resolvePriceId('starter', 'annual')).toBeNull()
    expect(resolvePriceId('pro', 'annual')).toBeNull()
  })
})

describe('classifyPriceId — inverso, usado pelo webhook', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, STRIPE_PRICE_STARTER_ANNUAL: STARTER_ANNUAL, STRIPE_PRICE_PRO_ANNUAL: PRO_ANNUAL }
  })
  afterEach(() => { process.env = { ...ORIGINAL_ENV } })

  it('classifica corretamente os 4 preços reais', () => {
    expect(classifyPriceId(STARTER_MONTHLY)).toEqual({ plan: 'starter', cycle: 'monthly' })
    expect(classifyPriceId(PRO_MONTHLY)).toEqual({ plan: 'pro', cycle: 'monthly' })
    expect(classifyPriceId(STARTER_ANNUAL)).toEqual({ plan: 'starter', cycle: 'annual' })
    expect(classifyPriceId(PRO_ANNUAL)).toEqual({ plan: 'pro', cycle: 'annual' })
  })

  it('nunca troca Starter por Pro nem mensal por anual', () => {
    expect(classifyPriceId(STARTER_MONTHLY)?.plan).not.toBe('pro')
    expect(classifyPriceId(PRO_ANNUAL)?.cycle).not.toBe('monthly')
  })

  it('Price ID desconhecido ou nulo: devolve null, nunca adivinha', () => {
    expect(classifyPriceId('price_desconhecido')).toBeNull()
    expect(classifyPriceId(null)).toBeNull()
    expect(classifyPriceId(undefined)).toBeNull()
  })

  it('sem as env vars anuais configuradas, um Price ID anual real deixa de ser reconhecido (nunca inventa a correspondência)', () => {
    delete process.env.STRIPE_PRICE_STARTER_ANNUAL
    expect(classifyPriceId(STARTER_ANNUAL)).toBeNull()
  })
})

describe('isPlanTier / isBillingCycle — validação de entrada', () => {
  it('aceita só os valores da lista fechada', () => {
    expect(isPlanTier('starter')).toBe(true)
    expect(isPlanTier('pro')).toBe(true)
    expect(isPlanTier('premium')).toBe(false)
    expect(isPlanTier(undefined)).toBe(false)
    expect(isBillingCycle('monthly')).toBe(true)
    expect(isBillingCycle('annual')).toBe(true)
    expect(isBillingCycle('semestral')).toBe(false)
  })
})

describe('PLAN_RANK', () => {
  it('Pro > Starter, independente de ciclo (o ciclo nunca entra nesta hierarquia)', () => {
    expect(PLAN_RANK.pro).toBeGreaterThan(PLAN_RANK.starter)
  })
})

// Bug real corrigido em 2026-09-19 (achado pelo Gilson em produção): o
// cartão "Plano atual" em app/upgrade decidia isto só pelo tier
// (professionals.plan), ignorando o ciclo — Pro mensal aparecia "ATIVO"
// mesmo com o seletor em Anual, impedindo abrir o checkout do Pro anual.
// Estes 5 casos são exatamente os pedidos por Gilson para confirmar a
// correção (rule 7 do pedido original).
describe('isActivePlanCycle — "Plano atual" depende do Price ID/ciclo real, nunca só do tier (P5.1, 2026-09-19)', () => {
  it('Pro mensal + seletor mensal → Plano atual (true)', () => {
    expect(isActivePlanCycle({ plan: 'pro', cycle: 'monthly' }, 'pro', 'monthly')).toBe(true)
  })

  it('Pro mensal + seletor anual → NÃO é o plano atual (false, deve aparecer o botão Pro anual)', () => {
    expect(isActivePlanCycle({ plan: 'pro', cycle: 'monthly' }, 'pro', 'annual')).toBe(false)
  })

  it('Pro anual + seletor anual → Plano atual (true)', () => {
    expect(isActivePlanCycle({ plan: 'pro', cycle: 'annual' }, 'pro', 'annual')).toBe(true)
  })

  it('Pro anual + seletor mensal → NÃO é o plano atual (false, deve aparecer o botão Pro mensal)', () => {
    expect(isActivePlanCycle({ plan: 'pro', cycle: 'annual' }, 'pro', 'monthly')).toBe(false)
  })

  it('plano na BD sem subscrição Stripe ativa (cycle null) → sempre false, nunca bloqueia nenhum ciclo', () => {
    expect(isActivePlanCycle({ plan: 'pro', cycle: null }, 'pro', 'monthly')).toBe(false)
    expect(isActivePlanCycle({ plan: 'pro', cycle: null }, 'pro', 'annual')).toBe(false)
  })

  it('status null/undefined (ainda a carregar) → sempre false, nunca bloqueia', () => {
    expect(isActivePlanCycle(null, 'pro', 'monthly')).toBe(false)
    expect(isActivePlanCycle(undefined, 'starter', 'annual')).toBe(false)
  })

  it('Starter segue exatamente a mesma lógica (regra 4 do pedido)', () => {
    expect(isActivePlanCycle({ plan: 'starter', cycle: 'monthly' }, 'starter', 'monthly')).toBe(true)
    expect(isActivePlanCycle({ plan: 'starter', cycle: 'monthly' }, 'starter', 'annual')).toBe(false)
    expect(isActivePlanCycle({ plan: 'starter', cycle: 'annual' }, 'starter', 'annual')).toBe(true)
    expect(isActivePlanCycle({ plan: 'starter', cycle: 'annual' }, 'starter', 'monthly')).toBe(false)
    expect(isActivePlanCycle({ plan: 'starter', cycle: null }, 'starter', 'monthly')).toBe(false)
  })

  it('nunca confunde Starter ativo com o cartão Pro, mesmo com o mesmo ciclo', () => {
    expect(isActivePlanCycle({ plan: 'starter', cycle: 'monthly' }, 'pro', 'monthly')).toBe(false)
    expect(isActivePlanCycle({ plan: 'pro', cycle: 'annual' }, 'starter', 'annual')).toBe(false)
  })
})

describe('simplifySubscriptionStatus — estado do Stripe reduzido para a interface', () => {
  it('active/trialing → active', () => {
    expect(simplifySubscriptionStatus('active')).toBe('active')
    expect(simplifySubscriptionStatus('trialing')).toBe('active')
  })

  it('past_due/unpaid → past_due', () => {
    expect(simplifySubscriptionStatus('past_due')).toBe('past_due')
    expect(simplifySubscriptionStatus('unpaid')).toBe('past_due')
  })

  it('canceled/incomplete_expired → canceled', () => {
    expect(simplifySubscriptionStatus('canceled')).toBe('canceled')
    expect(simplifySubscriptionStatus('incomplete_expired')).toBe('canceled')
  })

  it('null/undefined (sem stripe_subscription_id) → no_subscription, nunca "canceled"', () => {
    expect(simplifySubscriptionStatus(null)).toBe('no_subscription')
    expect(simplifySubscriptionStatus(undefined)).toBe('no_subscription')
  })

  it('valor Stripe não mapeado → unknown, nunca assume "active"', () => {
    expect(simplifySubscriptionStatus('incomplete')).toBe('unknown')
    expect(simplifySubscriptionStatus('paused')).toBe('unknown')
  })
})

// Acesso administrativo (2026-09-19): confirmado por leitura em produção
// que a única conta com um tier pago sem subscrição Stripe é a do Gilson,
// e que o seu user_id está na tabela `admins` — nunca inventa isto para
// nenhum profissional normal na mesma situação (fica 'no_subscription',
// tratado como estado inconsistente).
describe('resolveUnbilledStatus — distingue acesso administrativo de conta paga sem subscrição real', () => {
  it('admin com tier pago (Pro ou Starter) e sem subscrição → admin_access', () => {
    expect(resolveUnbilledStatus(true, 'pro')).toBe('admin_access')
    expect(resolveUnbilledStatus(true, 'starter')).toBe('admin_access')
  })

  it('profissional normal (não admin) com tier pago e sem subscrição → no_subscription, tratado como estado inconsistente', () => {
    expect(resolveUnbilledStatus(false, 'pro')).toBe('no_subscription')
    expect(resolveUnbilledStatus(false, 'starter')).toBe('no_subscription')
  })

  it('admin sem nenhum tier pago (null/inactive) → no_subscription, nunca inventa acesso administrativo sem um plano para o justificar', () => {
    expect(resolveUnbilledStatus(true, null)).toBe('no_subscription')
    expect(resolveUnbilledStatus(true, 'inactive')).toBe('no_subscription')
    expect(resolveUnbilledStatus(true, undefined)).toBe('no_subscription')
  })
})
