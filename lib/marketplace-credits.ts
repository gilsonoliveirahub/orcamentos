// P2 (2026-09-18): pacotes de créditos do marketplace — substituem os
// pacotes antigos (10/25/50 por 20€/45€/75€, sem opção de 1 crédito).
// Decisão de negócio ditada por Gilson (2026-09-18): todos os valores já
// incluem IVA; créditos continuam sem validade; 1 crédito = 1 lead do
// marketplace desbloqueado (nunca confundir com pedidos do link pessoal,
// que contam para o limite do plano, não para créditos).
//
// Fonte única — usada por app/creditos/page.tsx (UI autenticada),
// app/api/stripe/credits/route.ts (checkout) e app/marketing/page.tsx
// (página pública de preços). Nunca duplicar estes números noutro sítio;
// os totais e os preços por lead são os valores exatos ditados, não
// recalculados aqui (evita divergências de arredondamento silenciosas).
export interface CreditPack {
  id: string
  credits: number
  totalEur: number
  perLeadEur: number
  discountLabel: string
  label: string
  highlight?: boolean
}

export const CREDIT_PACKS: CreditPack[] = [
  { id: 'pack1', credits: 1, totalEur: 9.90, perLeadEur: 9.90, discountLabel: 'Sem desconto', label: 'Experimenta' },
  { id: 'pack10', credits: 10, totalEur: 89.10, perLeadEur: 8.91, discountLabel: '10% de desconto', label: 'Básico' },
  { id: 'pack25', credits: 25, totalEur: 210.38, perLeadEur: 8.42, discountLabel: '15% de desconto', label: 'Popular', highlight: true },
  { id: 'pack50', credits: 50, totalEur: 371.25, perLeadEur: 7.43, discountLabel: '25% de desconto', label: 'Pro' },
]

export function getCreditPack(id: string): CreditPack | undefined {
  return CREDIT_PACKS.find((p) => p.id === id)
}

// Todos os totais acima já são valores em euros com 2 decimais — arredondar
// para cêntimos é só para o formato exigido pela API do Stripe (unit_amount
// em cêntimos), nunca uma nova conta.
export function creditPackAmountCents(pack: CreditPack): number {
  return Math.round(pack.totalEur * 100)
}

export const CHEAPEST_CREDIT_PACK = CREDIT_PACKS[CREDIT_PACKS.length - 1]

// `toFixed(2)` sozinho usa ponto decimal (formato en-US) — a plataforma é
// toda em português de Portugal (vírgula decimal). Só troca o separador,
// nunca arredonda de forma diferente de toFixed.
export function formatEur(value: number): string {
  return value.toFixed(2).replace('.', ',')
}
