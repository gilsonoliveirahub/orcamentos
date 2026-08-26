import { describe, it, expect } from 'vitest'
import { groupPerformance } from './lead-performance'

describe('groupPerformance', () => {
  it('nunca mostra um grupo com menos leads que a amostra mínima (default 3)', () => {
    const leads = [
      { status: 'fechado', key: 'Pintura' },
      { status: 'fechado', key: 'Pintura' },
      { status: 'perdido', key: 'Canalização' }, // só 1 -> excluído
    ]
    const result = groupPerformance(leads, l => l.key)
    expect(result.map(r => r.label)).toEqual([])
  })

  it('com amostra suficiente, calcula total/fechados/conversão/faturação corretamente', () => {
    const leads = [
      { status: 'fechado', valor_fechado: 500, key: 'Pintura' },
      { status: 'fechado', valor_fechado: 300, key: 'Pintura' },
      { status: 'perdido', valor_fechado: null, key: 'Pintura' },
      { status: 'novo', valor_fechado: null, key: 'Pintura' },
    ]
    const result = groupPerformance(leads, l => l.key)
    expect(result).toEqual([
      { label: 'Pintura', total: 4, fechados: 2, conversionRate: 0.5, faturacaoReal: 800 },
    ])
  })

  it('fechado sem valor_fechado informado ("Prefiro não indicar"): conta para fechados, não soma à faturação', () => {
    const leads = [
      { status: 'fechado', valor_fechado: null, key: 'A' },
      { status: 'fechado', valor_fechado: 200, key: 'A' },
      { status: 'novo', valor_fechado: null, key: 'A' },
    ]
    const result = groupPerformance(leads, l => l.key)
    expect(result[0]).toEqual({ label: 'A', total: 3, fechados: 2, conversionRate: 2 / 3, faturacaoReal: 200 })
  })

  it('vários grupos com amostra suficiente: ordena por total descendente', () => {
    const leads = [
      ...Array(3).fill({ status: 'fechado', key: 'Pequeno' }),
      ...Array(5).fill({ status: 'novo', key: 'Grande' }),
    ]
    const result = groupPerformance(leads, l => l.key)
    expect(result.map(r => r.label)).toEqual(['Grande', 'Pequeno'])
  })

  it('limiar de amostra customizável', () => {
    const leads = [{ status: 'fechado', key: 'X' }, { status: 'novo', key: 'X' }]
    expect(groupPerformance(leads, l => l.key, 3)).toEqual([])
    expect(groupPerformance(leads, l => l.key, 2)).toHaveLength(1)
  })

  it('sem leads: lista vazia', () => {
    expect(groupPerformance([], () => 'x')).toEqual([])
  })
})
