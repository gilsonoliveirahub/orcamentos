import type Stripe from 'stripe'

// Partilhado por app/api/stripe/checkout e app/api/stripe/webhook — a
// partir da API 2025-03-31 do Stripe, current_period_start/end deixaram de
// existir no topo da Subscription e passaram para cada item (SDK 21.x já só
// os expõe aí). Nunca duplicar esta leitura nos dois sítios.
export function getSubscriptionPeriod(sub: Stripe.Subscription): { current_period_start: string | null; current_period_end: string | null } {
  const item = sub.items.data[0]
  return {
    current_period_start: item?.current_period_start ? new Date(item.current_period_start * 1000).toISOString() : null,
    current_period_end: item?.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : null,
  }
}
