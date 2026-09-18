import { describe, it, expect } from 'vitest'
import { estimatePriceRange } from './quote-estimate'

describe('estimatePriceRange — preço próprio do profissional por especialidade (Fase 2, 2026-09-15)', () => {
  it('usa price_per_m2 do profissional para especialidade "m2" (ex: Pavimentos e Revestimentos / chão flutuante) quando configurado', () => {
    const result = estimatePriceRange(
      'Pavimentos e Revestimentos',
      { area_m2: '40' },
      { price_per_m2: 25, min_quote: 200 }
    )
    expect(result.available).toBe(true)
    if (!result.available) throw new Error('unreachable')
    // 40m² × 25€ = 1000€; max = min × 1.4 (mesmo espalhamento já usado para Pintura)
    expect(result.min).toBe(1000)
    expect(result.max).toBe(1400)
  })

  it('aplica o min_quote do profissional quando o cálculo por área fica abaixo dele', () => {
    const result = estimatePriceRange(
      'Pavimentos e Revestimentos',
      { area_m2: '5' },
      { price_per_m2: 25, min_quote: 200 }
    )
    expect(result.available).toBe(true)
    if (!result.available) throw new Error('unreachable')
    // 5m² × 25€ = 125€, abaixo do mínimo de 200€ configurado
    expect(result.min).toBe(200)
  })

  // P0 (2026-09-18): antes disto, sem price_per_m2 configurado e sem
  // fórmula própria (Pavimentos e Revestimentos não tem entrada em
  // PRICE_TABLES), o resultado caía no fallback genérico "Outro"
  // (100€–500€ fixo, sem qualquer relação com a resposta do cliente). Esse
  // fallback foi removido por completo — o resultado correto agora é
  // "estimativa indisponível", nunca um intervalo inventado.
  it('sem price_per_m2 configurado e sem fórmula própria: available:false, nunca o antigo fallback 100€–500€', () => {
    const semPreco = estimatePriceRange('Pavimentos e Revestimentos', { area_m2: '40' })
    const comPrecoVazio = estimatePriceRange('Pavimentos e Revestimentos', { area_m2: '40' }, {})

    expect(semPreco).toEqual({ available: false, descricao: 'Trabalho a orçamentar' })
    expect(comPrecoVazio).toEqual(semPreco)
    // Nunca mais estes valores, mesmo por coincidência.
    expect(semPreco).not.toHaveProperty('min')
    expect(semPreco).not.toHaveProperty('max')
  })

  it('mesmo sem preço do profissional, uma especialidade com fórmula própria (ex: Electricidade) continua disponível — só falta referência para as que não têm PRICE_TABLES nem preço configurado', () => {
    const result = estimatePriceRange('Electricidade', { tipo_trabalho: 'Reparação / Avaria' })
    expect(result.available).toBe(true)
  })

  it('especialidade "pintura" nunca usa este caminho (tem o seu próprio calculateQuote) mesmo que price_per_m2 venha preenchido', () => {
    const result = estimatePriceRange('Pintura', { area_m2: '40' }, { price_per_m2: 25 })
    expect(result).not.toEqual({ available: true, min: 1000, max: 1400, descricao: 'Pintura — 40m²' })
  })

  it('área inválida/ausente: cai no comportamento antigo (fórmula própria com área padrão) em vez de rebentar ou ficar indisponível', () => {
    const result = estimatePriceRange('Jardinagem', {}, { price_per_m2: 10 })
    // Jardinagem tem entrada própria em PRICE_TABLES com fallback interno (area padrão 50)
    expect(result.available).toBe(true)
    if (!result.available) throw new Error('unreachable')
    expect(result.min).toBeGreaterThan(0)
  })
})
