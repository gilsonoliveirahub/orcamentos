// Pacotes de créditos do marketplace — preços 2026-10-17 (aprovados pelo
// proprietário, substituem os de 2026-09-18). Mudança de modelo fiscal:
// antes `totalEur` era o valor final já com IVA embutido no próprio
// número; agora os valores aprovados são SEM IVA ("mais IVA") e o IVA real
// (23%) é acrescentado pelo Stripe no checkout (automatic_tax, ver
// app/api/stripe/credits/route.ts) — nunca calculado aqui, para nunca
// duplicar nem dessincronizar do que o Stripe cobra de facto.
//
// `baseEur` é o valor SEM IVA — é este que vai para o Stripe
// (creditPackAmountCents) para o automatic_tax acrescentar o IVA real uma
// única vez. `totalEur`/`perLeadEur` são os valores DE REFERÊNCIA já COM
// os 23% de IVA (o que o cliente paga de facto) — continuam a ser os
// campos que a UI mostra (app/creditos, app/marketing), o significado não
// mudou, só passaram a ser calculados a partir de `baseEur` em vez de
// serem o próprio número cobrado.
//
// Fonte única — usada por app/creditos/page.tsx (UI autenticada),
// app/api/stripe/credits/route.ts (checkout) e app/marketing/page.tsx
// (página pública de preços). Nunca duplicar estes números noutro sítio.
export interface CreditPack {
  id: string
  credits: number
  baseEur: number
  totalEur: number
  perLeadEur: number
  discountLabel: string
  label: string
  highlight?: boolean
}

export const CREDIT_PACKS: CreditPack[] = [
  { id: 'pack1', credits: 1, baseEur: 19, totalEur: 23.37, perLeadEur: 23.37, discountLabel: 'Sem desconto', label: 'Experimenta' },
  { id: 'pack10', credits: 10, baseEur: 171, totalEur: 210.33, perLeadEur: 21.03, discountLabel: '10% de desconto', label: 'Básico' },
  { id: 'pack25', credits: 25, baseEur: 403.75, totalEur: 496.61, perLeadEur: 19.86, discountLabel: '15% de desconto', label: 'Popular', highlight: true },
  { id: 'pack50', credits: 50, baseEur: 712.50, totalEur: 876.38, perLeadEur: 17.53, discountLabel: '25% de desconto', label: 'Pro' },
]

export function getCreditPack(id: string): CreditPack | undefined {
  return CREDIT_PACKS.find((p) => p.id === id)
}

// unit_amount do Stripe tem de ser o valor SEM IVA — automatic_tax
// acrescenta o IVA real no checkout (ver app/api/stripe/credits/route.ts).
// Nunca usar totalEur aqui, duplicaria o imposto.
export function creditPackAmountCents(pack: CreditPack): number {
  return Math.round(pack.baseEur * 100)
}

export const CHEAPEST_CREDIT_PACK = CREDIT_PACKS[CREDIT_PACKS.length - 1]

// `toFixed(2)` sozinho usa ponto decimal (formato en-US) — a plataforma é
// toda em português de Portugal (vírgula decimal). Só troca o separador,
// nunca arredonda de forma diferente de toFixed.
export function formatEur(value: number): string {
  return value.toFixed(2).replace('.', ',')
}
