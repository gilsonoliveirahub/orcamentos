import { describe, it, expect } from 'vitest'
import { compareAIImpact, MIN_GROUP_SAMPLE } from './ai-impact'

function makeLead(overrides: Partial<Parameters<typeof compareAIImpact>[0][number]> = {}) {
  return {
    id: 'l1',
    status: 'novo',
    source: 'pessoal',
    zone_requested: null,
    metadata: {},
    created_at: '2026-08-01T00:00:00Z',
    updated_at: null,
    opened_at: null,
    professional_id: 'prof-1',
    valor_fechado: null,
    ...overrides,
  }
}

describe('compareAIImpact', () => {
  it('sem nenhum lead assistido por IA (estado real hoje): grupo assistido fica a zero, hasEnoughData=false', () => {
    const leads = [makeLead({ id: 'a' }), makeLead({ id: 'b' }), makeLead({ id: 'c' })]
    const result = compareAIImpact(leads, [], () => false)

    expect(result.assisted.sampleSize).toBe(0)
    expect(result.assisted.completenessRate).toBeNull()
    expect(result.control.sampleSize).toBe(3)
    expect(result.hasEnoughData).toBe(false)
  })

  it('particiona corretamente pelos dois grupos usando o critério fornecido pelo chamador', () => {
    const leads = [
      makeLead({ id: 'a', metadata: { ai_assisted: true } }),
      makeLead({ id: 'b', metadata: { ai_assisted: true } }),
      makeLead({ id: 'c' }),
    ]
    const result = compareAIImpact(leads, [], l => l.metadata?.ai_assisted === true)
    expect(result.assisted.sampleSize).toBe(2)
    expect(result.control.sampleSize).toBe(1)
  })

  it('calcula completude, conversão e fechados corretamente por grupo', () => {
    const leads = [
      makeLead({ id: 'a', status: 'fechado', metadata: { notas: 'x'.repeat(25), media_urls: ['f.jpg'] } }),
      makeLead({ id: 'b', status: 'perdido' }),
      makeLead({ id: 'c', status: 'novo' }),
    ]
    const result = compareAIImpact(leads, [], () => false)
    expect(result.control.fechadosCount).toBe(1)
    expect(result.control.conversionRate).toBeCloseTo(1 / 3)
    expect(result.control.completenessRate).toBeCloseTo(1 / 3) // só 'a' tem tudo completo
  })

  it('hasEnoughData só fica true quando ambos os grupos atingem a amostra mínima', () => {
    const assistedEnough = Array.from({ length: MIN_GROUP_SAMPLE }, (_, i) => makeLead({ id: `x${i}`, metadata: { ai_assisted: true } }))
    const controlEnough = Array.from({ length: MIN_GROUP_SAMPLE }, (_, i) => makeLead({ id: `y${i}` }))
    const result = compareAIImpact([...assistedEnough, ...controlEnough], [], l => l.metadata?.ai_assisted === true)
    expect(result.hasEnoughData).toBe(true)
  })

  it('estimateAccuracy fica null sem quotes/valor_fechado correspondentes (nunca inventa precisão sem dados)', () => {
    const leads = [makeLead()]
    const result = compareAIImpact(leads, [], () => false)
    expect(result.control.estimateAccuracy).toBeNull()
  })

  it('estimateAccuracy calcula corretamente quando há quote + valor_fechado', () => {
    const leads = [makeLead({ id: 'a', status: 'fechado', valor_fechado: 180 })]
    const quotes = [{ lead_id: 'a', valor_min: 100, valor_max: 200, valor_final: 150 }]
    const result = compareAIImpact(leads, quotes, () => false)
    expect(result.control.estimateAccuracy).toEqual({ sampleSize: 1, avgAbsErrorPercent: 20 })
  })
})
