import { describe, it, expect } from 'vitest'
import { getSubscriptionPeriod } from './stripe-subscription-period'

describe('getSubscriptionPeriod', () => {
  it('lê current_period_start/end do primeiro item, nunca do topo da subscrição', () => {
    const sub: any = { items: { data: [{ current_period_start: 1755302400, current_period_end: 1757980800 }] } }
    expect(getSubscriptionPeriod(sub)).toEqual({
      current_period_start: new Date(1755302400 * 1000).toISOString(),
      current_period_end: new Date(1757980800 * 1000).toISOString(),
    })
  })

  it('sem item (subscrição vazia): devolve null nos dois campos, nunca rebenta', () => {
    const sub: any = { items: { data: [] } }
    expect(getSubscriptionPeriod(sub)).toEqual({ current_period_start: null, current_period_end: null })
  })
})
