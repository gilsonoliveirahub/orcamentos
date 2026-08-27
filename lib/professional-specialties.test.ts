import { describe, it, expect } from 'vitest'
import { professionalSpecialties } from './professional-specialties'

describe('professionalSpecialties', () => {
  it('usa specialties[] quando preenchido', () => {
    expect(professionalSpecialties({ specialty: 'Pintura', specialties: ['Pintura', 'Jardinagem'] }))
      .toEqual(['Pintura', 'Jardinagem'])
  })

  it('cai para specialty singular quando specialties está vazio ou nulo (perfis antigos)', () => {
    expect(professionalSpecialties({ specialty: 'Pintura', specialties: [] })).toEqual(['Pintura'])
    expect(professionalSpecialties({ specialty: 'Pintura', specialties: null })).toEqual(['Pintura'])
  })

  it('sem nenhuma especialidade definida: lista vazia, nunca inventa uma', () => {
    expect(professionalSpecialties({ specialty: null, specialties: null })).toEqual([])
  })
})
