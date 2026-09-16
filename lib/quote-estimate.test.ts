import { describe, it, expect } from 'vitest'
import { estimatePriceRange } from './quote-estimate'

describe('estimatePriceRange — preço próprio do profissional por especialidade (Fase 2, 2026-09-15)', () => {
  it('usa price_per_m2 do profissional para especialidade "m2" (ex: Pavimentos e Revestimentos / chão flutuante) quando configurado', () => {
    const result = estimatePriceRange(
      'Pavimentos e Revestimentos',
      { area_m2: '40' },
      { price_per_m2: 25, min_quote: 200 }
    )
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
    // 5m² × 25€ = 125€, abaixo do mínimo de 200€ configurado
    expect(result.min).toBe(200)
  })

  it('sem price_per_m2 configurado: mantém o comportamento antigo (tabela genérica), sem quebrar nada', () => {
    const semPreco = estimatePriceRange('Pavimentos e Revestimentos', { area_m2: '40' })
    const comPrecoVazio = estimatePriceRange('Pavimentos e Revestimentos', { area_m2: '40' }, {})
    // 'Pavimentos e Revestimentos' não tem entrada própria em PRICE_TABLES — cai no fallback 'Outro'
    expect(semPreco).toEqual({ min: 100, max: 500, descricao: 'Trabalho a orçamentar' })
    expect(comPrecoVazio).toEqual(semPreco)
  })

  it('especialidade "pintura" nunca usa este caminho (tem o seu próprio calculateQuote) mesmo que price_per_m2 venha preenchido', () => {
    const result = estimatePriceRange('Pintura', { area_m2: '40' }, { price_per_m2: 25 })
    expect(result).not.toEqual({ min: 1000, max: 1400, descricao: 'Pintura — 40m²' })
  })

  it('área inválida/ausente: cai no comportamento antigo em vez de rebentar', () => {
    const result = estimatePriceRange('Jardinagem', {}, { price_per_m2: 10 })
    // Jardinagem tem entrada própria em PRICE_TABLES com fallback interno (area padrão 50)
    expect(result.min).toBeGreaterThan(0)
  })
})
