import { describe, it, expect } from 'vitest'
import { shouldShowStaleLeadsReminder, REMINDER_COOLDOWN_DAYS } from './stale-leads-reminder'

const NOW = new Date('2026-08-26T00:00:00Z').getTime()

describe('shouldShowStaleLeadsReminder', () => {
  it('sem nenhum processo por finalizar: nunca mostra, mesmo sem dispensa anterior', () => {
    expect(shouldShowStaleLeadsReminder({ staleCount: 0, dismissedAt: null, now: NOW })).toBe(false)
  })

  it('com processos por finalizar e nunca dispensado: mostra', () => {
    expect(shouldShowStaleLeadsReminder({ staleCount: 3, dismissedAt: null, now: NOW })).toBe(true)
  })

  it('dispensado há menos dias que o cooldown: não mostra (evita ser excessivo)', () => {
    const dismissedAt = NOW - 2 * 86400000
    expect(shouldShowStaleLeadsReminder({ staleCount: 3, dismissedAt, now: NOW })).toBe(false)
  })

  it('dispensado há exatamente o cooldown: volta a mostrar (o problema persiste)', () => {
    const dismissedAt = NOW - REMINDER_COOLDOWN_DAYS * 86400000
    expect(shouldShowStaleLeadsReminder({ staleCount: 3, dismissedAt, now: NOW })).toBe(true)
  })

  it('dispensado há mais dias que o cooldown: mostra', () => {
    const dismissedAt = NOW - 30 * 86400000
    expect(shouldShowStaleLeadsReminder({ staleCount: 1, dismissedAt, now: NOW })).toBe(true)
  })
})
