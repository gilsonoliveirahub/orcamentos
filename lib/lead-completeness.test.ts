import { describe, it, expect } from 'vitest'
import { computeLeadCompleteness, GENERIC_ZONE_LABEL } from './lead-completeness'

describe('computeLeadCompleteness', () => {
  it('lead do marketplace com zona genérica, sem notas, sem media: falha nas 3 verificações', () => {
    const lead = { source: 'marketplace', zone_requested: GENERIC_ZONE_LABEL, metadata: {} }
    const result = computeLeadCompleteness(lead)
    expect(result.missingCount).toBe(3)
    expect(result.checks.every(c => !c.met)).toBe(true)
  })

  it('lead do marketplace com zona específica, notas longas e fotos: tudo cumprido', () => {
    const lead = {
      source: 'marketplace',
      zone_requested: 'Cascais',
      metadata: { notas: 'Preciso pintar a sala e o corredor, paredes com fissuras', media_urls: ['a.jpg'] },
    }
    const result = computeLeadCompleteness(lead)
    expect(result.missingCount).toBe(0)
    expect(result.checks.every(c => c.met)).toBe(true)
  })

  it('lead do link pessoal: não verifica zona (não existe nesse fluxo), só notas/media', () => {
    const lead = { source: 'pessoal', zone_requested: null, metadata: {} }
    const result = computeLeadCompleteness(lead)
    expect(result.checks.map(c => c.key)).toEqual(['notas', 'media'])
    expect(result.missingCount).toBe(2)
  })

  it('notas muito curtas contam como em falta (abaixo de 20 caracteres)', () => {
    const lead = { source: 'pessoal', zone_requested: null, metadata: { notas: 'urgente' } }
    const result = computeLeadCompleteness(lead)
    expect(result.checks.find(c => c.key === 'notas')?.met).toBe(false)
  })

  it('metadata ausente (null): não rebenta, trata como tudo em falta', () => {
    const lead = { source: 'pessoal', zone_requested: null, metadata: null }
    expect(() => computeLeadCompleteness(lead)).not.toThrow()
    expect(computeLeadCompleteness(lead).missingCount).toBe(2)
  })
})
