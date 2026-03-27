export interface QuoteInput {
  area_m2: number
  tipo: 'interior' | 'exterior' | 'ambos'
  cor_escura: boolean
  fissuras: boolean
  mobilias: boolean
  primer: boolean
  teto: boolean
  prices: {
    price_m2_walls: number
    price_m2_ceiling: number
    price_m2_exterior: number
    extra_dark_color: number
    extra_cracks: number
    extra_furniture_move: number
    extra_primer: number
    min_quote: number
  }
  num_divisoes?: number
}

export interface QuoteResult {
  valor_base: number
  extras_total: number
  valor_final: number
  valor_min: number
  valor_max: number
  breakdown: string[]
}

export function calculateQuote(input: QuoteInput): QuoteResult {
  const { area_m2, tipo, cor_escura, fissuras, mobilias, primer, teto, prices, num_divisoes = 1 } = input
  const breakdown: string[] = []

  // Valor base
  let valor_base = 0
  if (tipo === 'interior' || tipo === 'ambos') {
    const paredes = area_m2 * prices.price_m2_walls
    valor_base += paredes
    breakdown.push(`Paredes (${area_m2}m² × €${prices.price_m2_walls}/m²) = €${paredes.toFixed(2)}`)
    if (teto) {
      const tecto = area_m2 * 0.4 * prices.price_m2_ceiling
      valor_base += tecto
      breakdown.push(`Teto (${(area_m2 * 0.4).toFixed(0)}m² × €${prices.price_m2_ceiling}/m²) = €${tecto.toFixed(2)}`)
    }
  }
  if (tipo === 'exterior' || tipo === 'ambos') {
    const exterior = area_m2 * prices.price_m2_exterior
    valor_base += exterior
    breakdown.push(`Exterior (${area_m2}m² × €${prices.price_m2_exterior}/m²) = €${exterior.toFixed(2)}`)
  }

  // Extras
  let extras_total = 0

  if (cor_escura) {
    const extra = valor_base * (prices.extra_dark_color - 1)
    extras_total += extra
    breakdown.push(`Cor escura (+${((prices.extra_dark_color - 1) * 100).toFixed(0)}%) = +€${extra.toFixed(2)}`)
  }
  if (fissuras) {
    const extra = area_m2 * prices.extra_cracks
    extras_total += extra
    breakdown.push(`Tratamento de fissuras (${area_m2}m² × €${prices.extra_cracks}) = +€${extra.toFixed(2)}`)
  }
  if (mobilias) {
    const extra = num_divisoes * prices.extra_furniture_move
    extras_total += extra
    breakdown.push(`Deslocação de móveis (${num_divisoes} div. × €${prices.extra_furniture_move}) = +€${extra.toFixed(2)}`)
  }
  if (primer) {
    const extra = area_m2 * prices.extra_primer
    extras_total += extra
    breakdown.push(`Primário (${area_m2}m² × €${prices.extra_primer}) = +€${extra.toFixed(2)}`)
  }

  let valor_final = Math.max(valor_base + extras_total, prices.min_quote)
  if (valor_final === prices.min_quote) {
    breakdown.push(`Mínimo aplicado: €${prices.min_quote}`)
  }

  // Margem de ±15% para apresentar intervalo
  const valor_min = Math.round(valor_final * 0.92)
  const valor_max = Math.round(valor_final * 1.10)

  return {
    valor_base: Math.round(valor_base * 100) / 100,
    extras_total: Math.round(extras_total * 100) / 100,
    valor_final: Math.round(valor_final * 100) / 100,
    valor_min,
    valor_max,
    breakdown,
  }
}

export function generateProposalText(lead: any, quote: QuoteResult, professional: any): string {
  const hoje = new Date().toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' })

  return `Olá ${lead.name || 'Cliente'} 👋

Obrigado pela confiança. Aqui está a sua proposta de orçamento:

📋 *PROPOSTA DE PINTURA*
Data: ${hoje}
Profissional: ${professional.name}

📐 *Detalhes do Trabalho*
${quote.breakdown.map(b => `• ${b}`).join('\n')}

💰 *Valor Estimado*
Entre *€${quote.valor_min}* e *€${quote.valor_max}*

Este valor inclui:
✅ Materiais e mão-de-obra
✅ Preparação das superfícies
✅ Limpeza no final

⏰ *Próximos Passos*
Posso agendar uma visita gratuita para confirmar as medidas e dar um orçamento exato.

Que dia lhe dá jeito? 🗓️

_${professional.name} — Pintor Profissional_`
}
