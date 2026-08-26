import { describe, it, expect } from 'vitest'
import { specialtyToSlug, specialtyFromSlug } from './specialty-slug'

describe('specialtyToSlug', () => {
  it('remove acentos e usa minúsculas', () => {
    expect(specialtyToSlug('Canalização')).toBe('canalizacao')
    expect(specialtyToSlug('Eletricidade')).toBe('eletricidade')
  })

  it('substitui espaços e caracteres não alfanuméricos por hífen', () => {
    expect(specialtyToSlug('Pavimentos e Revestimentos')).toBe('pavimentos-e-revestimentos')
    expect(specialtyToSlug('Ar Condicionado')).toBe('ar-condicionado')
  })

  it('nunca deixa hífens nas pontas', () => {
    expect(specialtyToSlug('  Estuque e Pladur  ')).not.toMatch(/^-|-$/)
  })
})

describe('specialtyFromSlug', () => {
  it('reencontra a especialidade real a partir do slug', () => {
    expect(specialtyFromSlug('canalizacao')).toBe('Canalização')
    expect(specialtyFromSlug('pavimentos-e-revestimentos')).toBe('Pavimentos e Revestimentos')
  })

  it('slug desconhecido devolve null (nunca inventa uma especialidade)', () => {
    expect(specialtyFromSlug('nao-existe-xyz')).toBeNull()
  })
})
