export interface QuoteInput {
  area_m2_paredes: number
  area_m2_tetos: number
  tipo: 'interior' | 'exterior' | 'ambos'
  // Antes chamava-se `cor_escura`, mas a pergunta nunca verificou a cor real
  // (só se há transição branco↔cor) — decisão de negócio 2026-09-16: passa a
  // ser um acréscimo fixo por qualquer mudança de cor, mesmo para cores claras.
  mudanca_cor: boolean
  fissuras: boolean
  mobilias: boolean
  primer: boolean
  prices: {
    price_m2_walls: number
    price_m2_ceiling: number
    price_m2_exterior: number
    // Antes `extra_dark_color` (multiplicador, ex: 1.25 = +25% sobre TODO o
    // valor_base, incluindo tetos). Agora incide só sobre paredes/exterior —
    // ver calculateQuote. O nome da coluna na BD (professionals.extra_dark_color)
    // não mudou, só este campo lógico — ver decisão em memória do projeto.
    extra_color_change: number
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
  const { area_m2_paredes, area_m2_tetos, tipo, mudanca_cor, fissuras, mobilias, primer, prices, num_divisoes = 1 } = input
  const area_total = area_m2_paredes + area_m2_tetos
  const breakdown: string[] = []

  // Valor base
  let valor_base = 0
  // Só a parte de paredes/exterior — usado para o suplemento de mudança de
  // cor, que nunca deve incidir sobre tetos (decisão de negócio 2026-09-16).
  let paredes_valor = 0
  if (tipo === 'interior' || tipo === 'ambos') {
    const paredes = area_m2_paredes * prices.price_m2_walls
    valor_base += paredes
    paredes_valor += paredes
    breakdown.push(`Paredes (${area_m2_paredes}m² × €${prices.price_m2_walls}/m²) = €${paredes.toFixed(2)}`)
    if (area_m2_tetos > 0) {
      const tecto = area_m2_tetos * prices.price_m2_ceiling
      valor_base += tecto
      breakdown.push(`Tetos (${area_m2_tetos}m² × €${prices.price_m2_ceiling}/m²) = €${tecto.toFixed(2)}`)
    }
  }
  if (tipo === 'exterior' || tipo === 'ambos') {
    const exterior = area_m2_paredes * prices.price_m2_exterior
    valor_base += exterior
    paredes_valor += exterior
    breakdown.push(`Exterior (${area_m2_paredes}m² × €${prices.price_m2_exterior}/m²) = €${exterior.toFixed(2)}`)
  }

  // Extras
  let extras_total = 0

  // Suplemento fixo por mudança de cor (branco→cor ou cor→branco), mesmo que
  // a cor nova seja clara — decisão de negócio 2026-09-16, substitui o
  // suplemento anterior de 25% sobre TUDO (que também incidia sobre tetos e
  // que nunca verificava se a cor era realmente escura). Incide só sobre
  // paredes/exterior, nunca sobre tetos.
  if (mudanca_cor) {
    const extra = paredes_valor * (prices.extra_color_change - 1)
    extras_total += extra
    breakdown.push(`Mudança de cor (+${((prices.extra_color_change - 1) * 100).toFixed(0)}%, só paredes) = +€${extra.toFixed(2)}`)
  }
  if (fissuras) {
    const extra = area_total * prices.extra_cracks
    extras_total += extra
    breakdown.push(`Tratamento de fissuras (${area_total}m² × €${prices.extra_cracks}) = +€${extra.toFixed(2)}`)
  }
  if (mobilias) {
    const extra = num_divisoes * prices.extra_furniture_move
    extras_total += extra
    breakdown.push(`Deslocação de móveis (${num_divisoes} div. × €${prices.extra_furniture_move}) = +€${extra.toFixed(2)}`)
  }
  if (primer) {
    const extra = area_total * prices.extra_primer
    extras_total += extra
    breakdown.push(`Primário (${area_total}m² × €${prices.extra_primer}) = +€${extra.toFixed(2)}`)
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
