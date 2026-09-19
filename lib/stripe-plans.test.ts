import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { resolvePriceId, classifyPriceId, isPlanTier, isBillingCycle, PLAN_RANK } from './stripe-plans'

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
