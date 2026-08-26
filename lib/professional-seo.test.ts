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
    const jsonLd = professionalJsonLd(BASE, [5, 4, 5])
    expect(jsonLd['@type']).toBe('LocalBusiness')
    expect(jsonLd.aggregateRating).toEqual({ '@type': 'AggregateRating', ratingValue: '4.7', reviewCount: 3 })
  })

  it('sem reviews: não inclui aggregateRating (nunca inventa uma nota)', () => {
    const jsonLd = professionalJsonLd(BASE, [])
    expect(jsonLd.aggregateRating).toBeUndefined()
  })

  it('sem zona: address/areaServed ficam undefined, não um valor vazio enganoso', () => {
    const jsonLd = professionalJsonLd({ ...BASE, zone: null }, [])
    expect(jsonLd.address).toBeUndefined()
    expect(jsonLd.areaServed).toBeUndefined()
  })
})
