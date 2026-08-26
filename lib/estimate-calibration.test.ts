import { describe, it, expect } from 'vitest'
import { buildCalibrationSamples, summarizeCalibration, summarizeCalibrationBySpecialty } from './estimate-calibration'

const professionals = [{ id: 'prof-pintura', specialty: 'Pintura' }, { id: 'prof-canaliza', specialty: 'Canalização' }]

describe('buildCalibrationSamples', () => {
  it('ignora quotes sem lead fechado', () => {
    const quotes = [{ lead_id: 'l1', valor_min: 100, valor_max: 200, valor_final: 150 }]
    const leads = [{ id: 'l1', status: 'novo', valor_fechado: null, professional_id: 'prof-pintura' }]
    expect(buildCalibrationSamples(quotes, leads, professionals)).toEqual([])
  })

  it('ignora leads fechados sem valor_fechado informado ("Prefiro não indicar")', () => {
    const quotes = [{ lead_id: 'l1', valor_min: 100, valor_max: 200, valor_final: 150 }]
    const leads = [{ id: 'l1', status: 'fechado', valor_fechado: null, professional_id: 'prof-pintura' }]
    expect(buildCalibrationSamples(quotes, leads, professionals)).toEqual([])
  })

  it('ignora quotes sem valor_final/min/max gravado', () => {
    const quotes = [{ lead_id: 'l1', valor_min: null, valor_max: 200, valor_final: 150 }]
    const leads = [{ id: 'l1', status: 'fechado', valor_fechado: 180, professional_id: 'prof-pintura' }]
    expect(buildCalibrationSamples(quotes, leads, professionals)).toEqual([])
  })

  it('calcula diferença absoluta/percentual e classifica dentro/acima/abaixo do intervalo', () => {
    const quotes = [
      { lead_id: 'dentro', valor_min: 100, valor_max: 200, valor_final: 150 },
      { lead_id: 'acima', valor_min: 100, valor_max: 200, valor_final: 150 },
      { lead_id: 'abaixo', valor_min: 100, valor_max: 200, valor_final: 150 },
    ]
    const leads = [
      { id: 'dentro', status: 'fechado', valor_fechado: 180, professional_id: 'prof-pintura' },
      { id: 'acima', status: 'fechado', valor_fechado: 250, professional_id: 'prof-pintura' },
      { id: 'abaixo', status: 'fechado', valor_fechado: 80, professional_id: 'prof-pintura' },
    ]
    const samples = buildCalibrationSamples(quotes, leads, professionals)
    expect(samples).toHaveLength(3)

    const dentro = samples.find(s => s.leadId === 'dentro')!
    expect(dentro.withinRange).toBe(true)
    expect(dentro.above).toBe(false)
    expect(dentro.below).toBe(false)
    expect(dentro.diffAbsolute).toBe(30)
    expect(dentro.diffPercent).toBeCloseTo(20, 5)

    const acima = samples.find(s => s.leadId === 'acima')!
    expect(acima.above).toBe(true)
    expect(acima.withinRange).toBe(false)

    const abaixo = samples.find(s => s.leadId === 'abaixo')!
    expect(abaixo.below).toBe(true)
    expect(abaixo.withinRange).toBe(false)
  })

  it('usa a especialidade do profissional do lead, cai para "Outro" se não encontrar', () => {
    const quotes = [{ lead_id: 'l1', valor_min: 100, valor_max: 200, valor_final: 150 }]
    const leads = [{ id: 'l1', status: 'fechado', valor_fechado: 180, professional_id: 'prof-inexistente' }]
    const samples = buildCalibrationSamples(quotes, leads, professionals)
    expect(samples[0].specialty).toBe('Outro')
  })
})

describe('summarizeCalibration', () => {
  it('sem amostras: null (nunca finge um erro médio de 0%)', () => {
    expect(summarizeCalibration([])).toBeNull()
  })

  it('agrega sampleSize, erro médio absoluto e contagens dentro/acima/abaixo', () => {
    const samples = buildCalibrationSamples(
      [
        { lead_id: 'a', valor_min: 100, valor_max: 200, valor_final: 150 },
        { lead_id: 'b', valor_min: 100, valor_max: 200, valor_final: 150 },
      ],
      [
        { id: 'a', status: 'fechado', valor_fechado: 180, professional_id: 'prof-pintura' }, // +20%
        { id: 'b', status: 'fechado', valor_fechado: 120, professional_id: 'prof-pintura' }, // -20%
      ],
      professionals
    )
    const summary = summarizeCalibration(samples)
    expect(summary).toEqual({ sampleSize: 2, avgAbsErrorPercent: 20, withinRangeCount: 2, aboveCount: 0, belowCount: 0 })
  })
})

describe('summarizeCalibrationBySpecialty', () => {
  it('nunca mostra uma especialidade com menos amostras que o mínimo (default 3)', () => {
    const samples = buildCalibrationSamples(
      [{ lead_id: 'a', valor_min: 100, valor_max: 200, valor_final: 150 }],
      [{ id: 'a', status: 'fechado', valor_fechado: 180, professional_id: 'prof-pintura' }],
      professionals
    )
    expect(summarizeCalibrationBySpecialty(samples)).toEqual([])
  })

  it('com amostra suficiente por especialidade, devolve o resumo dessa especialidade', () => {
    const quotes = Array.from({ length: 3 }, (_, i) => ({ lead_id: `p${i}`, valor_min: 100, valor_max: 200, valor_final: 150 }))
    const leads = quotes.map((q, i) => ({ id: q.lead_id, status: 'fechado' as const, valor_fechado: 150 + i, professional_id: 'prof-pintura' }))
    const samples = buildCalibrationSamples(quotes, leads, professionals)
    const result = summarizeCalibrationBySpecialty(samples)
    expect(result).toHaveLength(1)
    expect(result[0].specialty).toBe('Pintura')
    expect(result[0].sampleSize).toBe(3)
  })
})
