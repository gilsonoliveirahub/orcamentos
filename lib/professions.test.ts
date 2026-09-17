import { describe, it, expect } from 'vitest'
import { calcPaintingAreas, getProfessionPricingType } from './professions'
import { computeLeadCompleteness } from './lead-completeness'

const baseAnswers = {
  altura_paredes: '2.4m',
  num_quartos: '4 ou mais',
  tem_sala: 'Sim',
  tem_hall: 'Sim',
  num_wc: '0',
  area_total_m2: '130',
}

describe('calcPaintingAreas — regressão (sem casas de banho/exclusões, caso real da Elisa Reuter)', () => {
  it('mantém o valor já confirmado (171m²) quando não há resposta de WC nem exclusões', () => {
    const { area_paredes, area_tetos } = calcPaintingAreas(baseAnswers)
    expect(area_paredes).toBe(171)
    expect(area_tetos).toBe(130)
  })
})

describe('calcPaintingAreas — casas de banho (decisão de negócio 2026-09-16, sem assumir tamanho)', () => {
  it('"Paredes e tetos" + m² indicados: soma exatamente o valor dado pelo cliente, sem nenhuma assunção automática', () => {
    const semWc = calcPaintingAreas(baseAnswers)
    const comWc = calcPaintingAreas({
      ...baseAnswers, num_wc: '2', casas_banho_pintura: 'Paredes e tetos',
      casas_banho_m2_paredes: 'Sei os m²', casas_banho_m2: '15',
    })
    expect(comWc.area_paredes - semWc.area_paredes).toBe(15)
  })

  it('"Paredes e tetos" + "Não sei": não soma nada (nunca inventa m²) — fica sinalizado em computeLeadCompleteness', () => {
    const semWc = calcPaintingAreas(baseAnswers)
    const naoSei = calcPaintingAreas({ ...baseAnswers, num_wc: '2', casas_banho_pintura: 'Paredes e tetos', casas_banho_m2_paredes: 'Não sei' })
    expect(naoSei.area_paredes).toBe(semWc.area_paredes)

    const completeness = computeLeadCompleteness({
      source: 'pessoal', zone_requested: null,
      metadata: { casas_banho_pintura: 'Paredes e tetos', casas_banho_m2_paredes: 'Não sei' },
    })
    expect(completeness.checks.find(c => c.key === 'casas_banho_area')).toMatchObject({ met: false })
  })

  it('"Paredes e tetos" + "Sei os m²" mas resposta preenchida: não sinaliza a checagem de completude', () => {
    const completeness = computeLeadCompleteness({
      source: 'pessoal', zone_requested: null,
      metadata: { casas_banho_pintura: 'Paredes e tetos', casas_banho_m2_paredes: 'Sei os m²', casas_banho_m2: '15' },
    })
    expect(completeness.checks.find(c => c.key === 'casas_banho_area')).toBeUndefined()
  })

  it('"Apenas tetos" não acrescenta nada às paredes (mesmo com WC configurados)', () => {
    const semWc = calcPaintingAreas(baseAnswers)
    const apenasTetos = calcPaintingAreas({ ...baseAnswers, num_wc: '2', casas_banho_pintura: 'Apenas tetos' })
    expect(apenasTetos.area_paredes).toBe(semWc.area_paredes)
  })

  it('"Não serão pintadas" não acrescenta nada às paredes', () => {
    const semWc = calcPaintingAreas(baseAnswers)
    const naoSerao = calcPaintingAreas({ ...baseAnswers, num_wc: '3 ou mais', casas_banho_pintura: 'Não serão pintadas' })
    expect(naoSerao.area_paredes).toBe(semWc.area_paredes)
  })
})

describe('calcPaintingAreas — exclusões (decisão de negócio 2026-09-16)', () => {
  it('"Sim, sei quantos m²" desconta exatamente o valor indicado', () => {
    const semExclusao = calcPaintingAreas(baseAnswers)
    const comExclusao = calcPaintingAreas({ ...baseAnswers, exclusoes: 'Sim, sei quantos m²', exclusoes_m2: '12' })
    expect(semExclusao.area_paredes - comExclusao.area_paredes).toBe(12)
  })

  it('"Sim, mas não sei quantos m²" NUNCA desconta nada — evita inventar um número', () => {
    const semExclusao = calcPaintingAreas(baseAnswers)
    const naoSei = calcPaintingAreas({ ...baseAnswers, exclusoes: 'Sim, mas não sei quantos m²' })
    expect(naoSei.area_paredes).toBe(semExclusao.area_paredes)
  })

  it('"Não" não desconta nada', () => {
    const semExclusao = calcPaintingAreas(baseAnswers)
    const naoTem = calcPaintingAreas({ ...baseAnswers, exclusoes: 'Não', exclusoes_m2: '999' })
    // mesmo que exclusoes_m2 venha preenchido por engano, só conta se exclusoes for 'Sim, sei quantos m²'
    expect(naoTem.area_paredes).toBe(semExclusao.area_paredes)
  })

  it('nunca desce abaixo do mínimo de 10m², mesmo com exclusão muito grande', () => {
    const result = calcPaintingAreas({ ...baseAnswers, num_quartos: '0', tem_sala: 'Não', tem_hall: 'Não', exclusoes: 'Sim, sei quantos m²', exclusoes_m2: '500' })
    expect(result.area_paredes).toBe(10)
  })
})

describe('getProfessionPricingType', () => {
  it('classifica Pintura, "por hora", "por m²" e genérico corretamente', () => {
    expect(getProfessionPricingType('Pintura')).toBe('pintura')
    expect(getProfessionPricingType('Canalização')).toBe('hourly')
    expect(getProfessionPricingType('Pavimentos e Revestimentos')).toBe('m2')
    expect(getProfessionPricingType('Editor de vídeos')).toBe('generic')
  })
})
