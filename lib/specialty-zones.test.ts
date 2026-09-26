import { describe, it, expect } from 'vitest'
import { computeUniqueZones, formatZonesSummary } from './specialty-zones'

describe('computeUniqueZones', () => {
  it('deduplica e ordena alfabeticamente, ignorando null/vazio', () => {
    const zones = computeUniqueZones([
      { zone: 'Porto' }, { zone: 'Lisboa' }, { zone: 'Porto' }, { zone: null }, { zone: '  ' },
    ])
    expect(zones).toEqual(['Lisboa', 'Porto'])
  })

  it('devolve array vazio quando nenhum profissional tem zona', () => {
    expect(computeUniqueZones([{ zone: null }, { zone: null }])).toEqual([])
  })
})

describe('formatZonesSummary', () => {
  it('devolve null quando não há zonas (nunca inventa texto geográfico)', () => {
    expect(formatZonesSummary([])).toBeNull()
  })

  it('junta até 3 zonas com vírgulas', () => {
    expect(formatZonesSummary(['Lisboa', 'Porto'])).toBe('Lisboa, Porto')
    expect(formatZonesSummary(['Lisboa', 'Porto', 'Cascais'])).toBe('Lisboa, Porto, Cascais')
  })

  it('resume para "e mais N zonas" a partir da 4ª', () => {
    expect(formatZonesSummary(['Lisboa', 'Porto', 'Cascais', 'Sintra'])).toBe('Lisboa, Porto, Cascais e mais 1 zona')
    expect(formatZonesSummary(['Lisboa', 'Porto', 'Cascais', 'Sintra', 'Braga'])).toBe('Lisboa, Porto, Cascais e mais 2 zonas')
  })
})
