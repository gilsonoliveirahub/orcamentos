import { describe, it, expect } from 'vitest'
import { calcPaintingAreas, getProfessionPricingType, getLeadSpecialty, matchesShowIf, mapAnswersToLeadFields, generateAnswersSummary, PROFESSIONS } from './professions'
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

// P4 (2026-09-19): "permitir introduzir diretamente a área a pintar",
// mantendo intacta a alternativa por divisões/altura para quem não sabe.
describe('calcPaintingAreas — área de parede indicada diretamente (P4, 2026-09-19)', () => {
  it('usa area_paredes_pintar_m2 tal e qual, nunca recalcula a partir de divisões/altura', () => {
    const result = calcPaintingAreas({ area_paredes_pintar_m2: '65', area_total_m2: '80' })
    expect(result.area_paredes).toBe(65)
    expect(result.area_tetos).toBe(80)
  })

  it('tem prioridade sobre altura_paredes/num_quartos, mesmo que ambos venham preenchidos', () => {
    const direct = calcPaintingAreas({ area_paredes_pintar_m2: '65', ...baseAnswers })
    expect(direct.area_paredes).toBe(65) // não os 171m² do cálculo por divisões
  })

  it('nunca desce abaixo do mínimo de 10m², mesmo com um valor direto muito baixo', () => {
    expect(calcPaintingAreas({ area_paredes_pintar_m2: '2' }).area_paredes).toBe(10)
  })

  it('sem area_paredes_pintar_m2, cai no cálculo por divisões/altura como sempre (alternativa preservada)', () => {
    const result = calcPaintingAreas(baseAnswers)
    expect(result.area_paredes).toBe(171)
  })
})

describe('mapAnswersToLeadFields — reconhece area_paredes_pintar_m2 como "formulário novo" (P4)', () => {
  it('q3_area_m2 usa a área direta quando presente, mesmo sem altura_paredes', () => {
    const fields = mapAnswersToLeadFields({ area_paredes_pintar_m2: '65', area_total_m2: '20' })
    expect(fields.q3_area_m2).toBe(65)
    expect(fields.q8_teto).toBe(true) // area_tetos (20) > 0
  })
})

describe('matchesShowIf — condição única e lista de condições (AND)', () => {
  it('sem showIf, mostra sempre', () => {
    expect(matchesShowIf(undefined, {})).toBe(true)
  })

  it('objeto único: comportamento igual ao de sempre (valor exato ou lista de valores)', () => {
    expect(matchesShowIf({ key: 'a', value: 'x' }, { a: 'x' })).toBe(true)
    expect(matchesShowIf({ key: 'a', value: 'x' }, { a: 'y' })).toBe(false)
    expect(matchesShowIf({ key: 'a', value: ['x', 'y'] }, { a: 'y' })).toBe(true)
  })

  it('lista de condições: só mostra quando TODAS batem (AND), nunca basta uma', () => {
    const showIf = [{ key: 'a', value: 'x' }, { key: 'b', value: 'y' }]
    expect(matchesShowIf(showIf, { a: 'x', b: 'y' })).toBe(true)
    expect(matchesShowIf(showIf, { a: 'x', b: 'outro' })).toBe(false)
    expect(matchesShowIf(showIf, { a: 'outro', b: 'y' })).toBe(false)
  })
})

describe('Pintura — pergunta de área direta não quebra o fluxo por divisões (P4, 2026-09-19)', () => {
  const pintura = PROFESSIONS['Pintura'].questions
  const byKey = (k: string) => pintura.find(q => q.key === k)

  it('sabe_area_pintura e area_paredes_pintar_m2 existem, nesta ordem, antes das perguntas de divisões', () => {
    const keys = pintura.map(q => q.key)
    const iSabe = keys.indexOf('sabe_area_pintura')
    const iArea = keys.indexOf('area_paredes_pintar_m2')
    const iAltura = keys.indexOf('altura_paredes')
    expect(iSabe).toBeGreaterThan(-1)
    expect(iArea).toBeGreaterThan(iSabe)
    expect(iAltura).toBeGreaterThan(iArea)
  })

  it('as perguntas de divisões (altura/quartos/sala/cozinha/wc/hall) só aparecem quando o cliente NÃO sabe a área', () => {
    for (const key of ['altura_paredes', 'num_quartos', 'tem_sala', 'tem_cozinha', 'num_wc', 'tem_hall']) {
      const q = byKey(key)!
      const answers = { subtipo_pintura: 'Pintura de paredes/tetos', sabe_area_pintura: 'Sim, sei a área a pintar' }
      expect(matchesShowIf(q.showIf, answers)).toBe(false)
      expect(matchesShowIf(q.showIf, { ...answers, sabe_area_pintura: 'Não sei — prefiro indicar as divisões' })).toBe(true)
    }
  })

  it('extras independentes da área (mudança de cor, fissuras, móveis, primário, tetos) continuam a aparecer nos dois casos', () => {
    for (const key of ['mudanca_de_cor', 'fissuras', 'mobilias', 'primer', 'area_total_m2']) {
      const q = byKey(key)!
      const base = { subtipo_pintura: 'Pintura de paredes/tetos' }
      expect(matchesShowIf(q.showIf, { ...base, sabe_area_pintura: 'Sim, sei a área a pintar' })).toBe(true)
      expect(matchesShowIf(q.showIf, { ...base, sabe_area_pintura: 'Não sei — prefiro indicar as divisões' })).toBe(true)
    }
  })
})

describe('generateAnswersSummary — resumo automático (P4, 2026-09-19)', () => {
  it('lista as respostas dadas, uma por linha, "pergunta sem ?: resposta"', () => {
    const summary = generateAnswersSummary(PROFESSIONS['Canalização'], {
      tipo_problema: 'Fuga de água', local: 'Casa de banho',
    })
    expect(summary).toContain('Qual o tipo de problema: Fuga de água')
    expect(summary).toContain('Onde é o problema: Casa de banho')
  })

  it('ignora perguntas sem resposta — nunca inventa nada', () => {
    const summary = generateAnswersSummary(PROFESSIONS['Canalização'], { tipo_problema: 'Entupimento' })
    expect(summary.split('\n')).toHaveLength(1)
  })

  it('nunca inclui "notas" (tem campo próprio, mostrado à parte)', () => {
    const summary = generateAnswersSummary(PROFESSIONS['Canalização'], { tipo_problema: 'Entupimento', notas: 'texto qualquer' })
    expect(summary).not.toContain('texto qualquer')
  })

  it('formata arrays (multiselect) e booleanos de forma legível', () => {
    const summary = generateAnswersSummary(PROFESSIONS['Pintura'], {
      madeiras_itens: ['Portas interiores', 'Janelas'],
    })
    expect(summary).toContain('Portas interiores, Janelas')
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

// P0 (2026-09-18): profissional com várias especialidades tem de receber o
// cálculo/questionário da especialidade REALMENTE pedida pelo cliente, nunca
// da especialidade "principal"/primeira do profissional.
describe('getLeadSpecialty — especialidade do lead, nunca a "principal" do profissional', () => {
  it('lead do marketplace: usa lead.specialty, mesmo quando diverge da especialidade principal do profissional', () => {
    const lead = { specialty: 'Jardinagem', professionals: { specialty: 'Pintura' } }
    expect(getLeadSpecialty(lead)).toBe('Jardinagem')
  })

  it('lead do link pessoal com várias especialidades: usa metadata._service_specialty quando lead.specialty não existe', () => {
    const lead = { specialty: null, metadata: { _service_specialty: 'Pavimentos e Revestimentos' }, professionals: { specialty: 'Pintura' } }
    expect(getLeadSpecialty(lead)).toBe('Pavimentos e Revestimentos')
  })

  it('lead.specialty tem sempre prioridade sobre metadata._service_specialty quando ambos existem', () => {
    const lead = { specialty: 'Canalização', metadata: { _service_specialty: 'Electricidade' }, professionals: { specialty: 'Pintura' } }
    expect(getLeadSpecialty(lead)).toBe('Canalização')
  })

  it('lead antigo sem specialty nem metadata._service_specialty: cai no último recurso, professionals.specialty', () => {
    const lead = { specialty: null, metadata: {}, professionals: { specialty: 'Estuque e Pladur' } }
    expect(getLeadSpecialty(lead)).toBe('Estuque e Pladur')
  })

  it('sem nenhuma informação (lead muito antigo, sem professionals): default histórico "Pintura"', () => {
    expect(getLeadSpecialty({ specialty: null, metadata: null, professionals: null })).toBe('Pintura')
    expect(getLeadSpecialty(null)).toBe('Pintura')
    expect(getLeadSpecialty(undefined)).toBe('Pintura')
  })

  it('caso concreto do diagnóstico: profissional com Pintura + Pavimentos e Revestimentos, lead pediu Pavimentos', () => {
    const lead = {
      specialty: null,
      metadata: { _service_specialty: 'Pavimentos e Revestimentos', tipo_servico: 'Chão flutuante novo' },
      professionals: { specialty: 'Pintura', specialties: ['Pintura', 'Pavimentos e Revestimentos'] },
    }
    expect(getLeadSpecialty(lead)).toBe('Pavimentos e Revestimentos')
  })
})
