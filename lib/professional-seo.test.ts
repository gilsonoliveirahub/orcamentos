import { describe, it, expect } from 'vitest'
import { specialtyLabel, professionalTitle, professionalDescription, professionalJsonLd } from './professional-seo'

const BASE = { name: 'Ana Silva', specialty: 'Pintura', specialties: [], zone: 'Porto', description: null, avatar_url: null }

describe('specialtyLabel', () => {
  it('usa a primeira de specialties[] quando definida', () => {
    expect(specialtyLabel({ specialty: 'Pintura', specialties: ['Canalização', 'Eletricidade'] })).toBe('Canalização')
  })

  it('cai para specialty singular quando specialties está vazio', () => {
    expect(specialtyLabel({ specialty: 'Pintura', specialties: [] })).toBe('Pintura')
  })

  it('especialidade sem label conhecido (não está em PROFESSIONS): usa o valor em bruto', () => {
    expect(specialtyLabel({ specialty: 'Algo Inventado', specialties: [] })).toBe('Algo Inventado')
  })

  it('sem nenhuma especialidade: fallback genérico "Serviços"', () => {
    expect(specialtyLabel({ specialty: null, specialties: [] })).toBe('Serviços')
  })
})

describe('professionalTitle', () => {
  it('inclui nome, especialidade e zona', () => {
    expect(professionalTitle(BASE)).toBe('Ana Silva — Pintura em Porto | FaçoPorTi')
  })

  it('sem zona: omite "em ..."', () => {
    expect(professionalTitle({ ...BASE, zone: null })).toBe('Ana Silva — Pintura | FaçoPorTi')
  })
})

describe('professionalDescription', () => {
  it('usa a bio do profissional quando existe, truncada a 155 caracteres', () => {
    const longBio = 'x'.repeat(200)
    const desc = professionalDescription({ ...BASE, description: longBio })
    expect(desc.length).toBe(155)
  })

  it('sem bio: gera descrição genérica com nome/especialidade/zona', () => {
    expect(professionalDescription({ ...BASE, description: null }))
      .toContain('Ana Silva, pintura em Porto')
  })
})

describe('professionalJsonLd', () => {
  it('inclui aggregateRating quando há reviews', () => {
    const jsonLd = professionalJsonLd(BASE, [{ rating: 5 }, { rating: 4 }, { rating: 5 }])
    expect(jsonLd['@type']).toBe('LocalBusiness')
    expect(jsonLd.aggregateRating).toEqual({ '@type': 'AggregateRating', ratingValue: '4.7', reviewCount: 3 })
  })

  it('sem reviews: não inclui aggregateRating nem review (nunca inventa uma nota)', () => {
    const jsonLd = professionalJsonLd(BASE, [])
    expect(jsonLd.aggregateRating).toBeUndefined()
    expect(jsonLd.review).toBeUndefined()
  })

  it('sem zona: address/areaServed ficam undefined, não um valor vazio enganoso', () => {
    const jsonLd = professionalJsonLd({ ...BASE, zone: null }, [])
    expect(jsonLd.address).toBeUndefined()
    expect(jsonLd.areaServed).toBeUndefined()
  })

  it('zona com uma só área: areaServed é string simples', () => {
    const jsonLd = professionalJsonLd(BASE, [])
    expect(jsonLd.areaServed).toBe('Porto')
  })

  it('zona com várias áreas separadas por vírgula: areaServed vira lista de Place', () => {
    const jsonLd = professionalJsonLd({ ...BASE, zone: 'Lisboa, Margem Sul e Arredores' }, [])
    expect(jsonLd.areaServed).toEqual([
      { '@type': 'Place', name: 'Lisboa' },
      { '@type': 'Place', name: 'Margem Sul e Arredores' },
    ])
  })

  it('knowsAbout inclui todas as especialidades reais, não só a primeira', () => {
    const jsonLd = professionalJsonLd({ ...BASE, specialty: 'Pintura', specialties: ['Pintura', 'Jardinagem'] }, [])
    expect(jsonLd.knowsAbout).toEqual(['Pintura', 'Jardinagem'])
  })

  it('knowsAbout com uma só especialidade: string simples (não array de 1)', () => {
    const jsonLd = professionalJsonLd(BASE, [])
    expect(jsonLd.knowsAbout).toBe('Pintura')
  })

  it('inclui reviews reais como Review, nunca inventa autor/texto que não existam', () => {
    const jsonLd = professionalJsonLd(BASE, [
      { rating: 5, client_name: 'Maria', comment: 'Excelente trabalho', created_at: '2026-01-01T00:00:00Z' },
      { rating: 4, client_name: null, comment: null, created_at: null },
    ])
    expect(jsonLd.review).toEqual([
      { '@type': 'Review', author: { '@type': 'Person', name: 'Maria' }, reviewRating: { '@type': 'Rating', ratingValue: 5, bestRating: 5, worstRating: 1 }, reviewBody: 'Excelente trabalho', datePublished: '2026-01-01T00:00:00Z' },
      { '@type': 'Review', author: { '@type': 'Person', name: 'Cliente FaçoPorTi' }, reviewRating: { '@type': 'Rating', ratingValue: 4, bestRating: 5, worstRating: 1 }, reviewBody: undefined, datePublished: undefined },
    ])
  })

  it('nunca inclui mais de 10 reviews no JSON-LD, mesmo havendo mais', () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ rating: 5, client_name: `Cliente ${i}` }))
    const jsonLd = professionalJsonLd(BASE, many)
    expect((jsonLd.review as unknown[]).length).toBe(10)
    // aggregateRating.reviewCount continua a refletir o total real, não o corte de exibição.
    expect((jsonLd.aggregateRating as { reviewCount: number }).reviewCount).toBe(15)
  })
})
