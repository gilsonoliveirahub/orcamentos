import { describe, it, expect } from 'vitest'
import { getEffectivePlan, isPaidEffective, isProEffective } from './effective-plan'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

describe('getEffectivePlan', () => {
  it('novo utilizador em trial (acabou de se registar, 7 dias pela frente) → starter efetivo', () => {
    const now = new Date('2026-08-27T12:00:00Z')
    const prof = { plan: 'free', trial_ends_at: new Date(now.getTime() + 7 * DAY).toISOString() }
    expect(getEffectivePlan(prof, now)).toBe('starter')
  })

  it('trial ativo (ainda faltam horas) → starter efetivo', () => {
    const now = new Date('2026-08-27T12:00:00Z')
    const prof = { plan: 'free', trial_ends_at: new Date(now.getTime() + 2 * HOUR).toISOString() }
    expect(getEffectivePlan(prof, now)).toBe('starter')
  })

  it('trial expirado (sem subscrição paga) → free efetivo', () => {
    const now = new Date('2026-08-27T12:00:00Z')
    const prof = { plan: 'free', trial_ends_at: new Date(now.getTime() - DAY).toISOString() }
    expect(getEffectivePlan(prof, now)).toBe('free')
  })

  it('sem trial_ends_at nenhum (conta antiga) e plan free → free efetivo', () => {
    expect(getEffectivePlan({ plan: 'free', trial_ends_at: null })).toBe('free')
    expect(getEffectivePlan({ plan: null, trial_ends_at: undefined })).toBe('free')
  })

  it('Starter pago → starter, independentemente do trial', () => {
    const now = new Date('2026-08-27T12:00:00Z')
    expect(getEffectivePlan({ plan: 'starter', trial_ends_at: new Date(now.getTime() - DAY).toISOString() }, now)).toBe('starter')
  })

  it('Pro pago → pro, mesmo com trial ainda "ativo" no campo (nunca deveria acontecer, mas plan pago manda sempre)', () => {
    const now = new Date('2026-08-27T12:00:00Z')
    expect(getEffectivePlan({ plan: 'pro', trial_ends_at: new Date(now.getTime() + DAY).toISOString() }, now)).toBe('pro')
  })

  it('inactive (cancelado/pagamento falhado) → inactive, nunca free nem starter, mesmo com trial_ends_at no futuro', () => {
    const now = new Date('2026-08-27T12:00:00Z')
    expect(getEffectivePlan({ plan: 'inactive', trial_ends_at: new Date(now.getTime() + DAY).toISOString() }, now)).toBe('inactive')
    expect(getEffectivePlan({ plan: 'inactive', trial_ends_at: null }, now)).toBe('inactive')
  })
})

describe('isPaidEffective', () => {
  it('starter e pro contam como pago', () => {
    expect(isPaidEffective('starter')).toBe(true)
    expect(isPaidEffective('pro')).toBe(true)
  })

  it('free e inactive nunca contam como pago — inactive não recebe nova utilização comercial paga', () => {
    expect(isPaidEffective('free')).toBe(false)
    expect(isPaidEffective('inactive')).toBe(false)
  })
})

describe('isProEffective', () => {
  it('só o plano pro real satisfaz isto', () => {
    expect(isProEffective('pro')).toBe(true)
    expect(isProEffective('starter')).toBe(false)
    expect(isProEffective('free')).toBe(false)
    expect(isProEffective('inactive')).toBe(false)
  })

  it('trial (starter efetivo) nunca satisfaz exclusividade Pro', () => {
    const now = new Date('2026-08-27T12:00:00Z')
    const trialEffective = getEffectivePlan({ plan: 'free', trial_ends_at: new Date(now.getTime() + DAY).toISOString() }, now)
    expect(trialEffective).toBe('starter')
    expect(isProEffective(trialEffective)).toBe(false)
  })
})
