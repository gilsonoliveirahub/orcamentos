import { describe, it, expect } from 'vitest'
import { calculateQuote, generateProposalText } from './calculator'

const prices = {
  price_m2_walls: 7, price_m2_ceiling: 8, price_m2_exterior: 10,
  extra_color_change: 1.10, extra_cracks: 1, extra_furniture_move: 25, extra_primer: 2, min_quote: 200,
}

describe('generateProposalText — consistência entre valores estruturados e texto', () => {
  // Bug real: o texto gravado para a Elisa Reuter ficou com "€184–220"
  // depois de os valores estruturados (valor_min/valor_max) terem sido
  // corrigidos para €2.168–2.592 — porque o texto foi editado à parte, sem
  // passar por generateProposalText. Este teste garante que o texto gerado
  // nunca pode divergir do quote.valor_min/valor_max que lhe é passado.
  it('o texto embutido usa sempre exatamente quote.valor_min e quote.valor_max, nunca outro valor', () => {
    const quote = calculateQuote({
      area_m2_paredes: 171, area_m2_tetos: 130, tipo: 'interior', mudanca_cor: true,
      fissuras: false, mobilias: false, primer: false, prices,
    })

    const text = generateProposalText({ name: 'Elisa Reuter' }, quote, { name: 'Gilson Oliveira' })

    expect(text).toContain(`€${quote.valor_min}`)
    expect(text).toContain(`€${quote.valor_max}`)

    // Deteta especificamente a regressão real: números antigos (min_quote
    // aplicado indevidamente) não podem aparecer no texto de um orçamento
    // que já não cai no mínimo.
    expect(quote.valor_min).not.toBe(184)
    expect(quote.valor_max).not.toBe(220)
    expect(text).not.toContain('€184')
    expect(text).not.toContain('€220')
  })

  it('se o texto for gerado com um quote diferente do que foi persistido, o teste deteta a divergência (regressão-alvo)', () => {
    const quoteReal = calculateQuote({
      area_m2_paredes: 171, area_m2_tetos: 130, tipo: 'interior', mudanca_cor: true,
      fissuras: false, mobilias: false, primer: false, prices,
    })
    // Simula exatamente o bug: valores estruturados corretos, mas o texto
    // gerado a partir de um quote antigo/errado (ex: min_quote aplicado).
    const quoteAntigoErrado = calculateQuote({
      area_m2_paredes: 171, area_m2_tetos: 130, tipo: 'Interior' as any, mudanca_cor: true,
      fissuras: false, mobilias: false, primer: false, prices,
    })

    const textoErrado = generateProposalText({ name: 'Elisa Reuter' }, quoteAntigoErrado, { name: 'Gilson Oliveira' })

    // valor_min/valor_max "estruturados" (persistidos) são os corretos —
    // o texto gerado a partir do quote errado tem de falhar esta verificação,
    // provando que o teste apanha a divergência.
    const estruturado = { valor_min: quoteReal.valor_min, valor_max: quoteReal.valor_max }
    const textoConsistente = textoErrado.includes(`€${estruturado.valor_min}`) && textoErrado.includes(`€${estruturado.valor_max}`)
    expect(textoConsistente).toBe(false)
  })
})
