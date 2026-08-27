import { describe, it, expect } from 'vitest'
import { getAdminPlanLabel, isTrialEndingSoon } from './admin-plan-label'

const DAY = 24 * 60 * 60 * 1000

describe('getAdminPlanLabel', () => {
  const now = new Date('2026-08-27T12:00:00Z')

  it('plan pro/starter/inactive: rótulo direto, igual ao valor guardado', () => {
    expect(getAdminPlanLabel({ plan: 'pro', trial_ends_at: null }, now)).toBe('pro')
    expect(getAdminPlanLabel({ plan: 'starter', trial_ends_at: null }, now)).toBe('starter')
    expect(getAdminPlanLabel({ plan: 'inactive', trial_ends_at: null }, now)).toBe('inactive')
  })

  it('free/null com trial ativo: distingue "trial" de "starter" (ao contrário de getEffectivePlan)', () => {
    const trialEndsAt = new Date(now.getTime() + DAY).toISOString()
    expect(getAdminPlanLabel({ plan: 'free', trial_ends_at: trialEndsAt }, now)).toBe('trial')
    expect(getAdminPlanLabel({ plan: null, trial_ends_at: trialEndsAt }, now)).toBe('trial')
  })

  it('free/null com trial expirado ou sem trial: free', () => {
    const expired = new Date(now.getTime() - DAY).toISOString()
    expect(getAdminPlanLabel({ plan: 'free', trial_ends_at: expired }, now)).toBe('free')
    expect(getAdminPlanLabel({ plan: 'free', trial_ends_at: null }, now)).toBe('free')
    expect(getAdminPlanLabel({ plan: null, trial_ends_at: undefined }, now)).toBe('free')
  })
})

describe('isTrialEndingSoon', () => {
  const now = new Date('2026-08-27T12:00:00Z')

  it('trial com menos de 7 dias pela frente: true', () => {
    expect(isTrialEndingSoon({ plan: 'free', trial_ends_at: new Date(now.getTime() + 2 * DAY).toISOString() }, now)).toBe(true)
  })

  it('trial com mais de 7 dias pela frente: false', () => {
    expect(isTrialEndingSoon({ plan: 'free', trial_ends_at: new Date(now.getTime() + 10 * DAY).toISOString() }, now)).toBe(false)
  })

  it('não está em trial (starter/pro/free sem trial): sempre false', () => {
    expect(isTrialEndingSoon({ plan: 'starter', trial_ends_at: null }, now)).toBe(false)
    expect(isTrialEndingSoon({ plan: 'free', trial_ends_at: null }, now)).toBe(false)
  })
})
