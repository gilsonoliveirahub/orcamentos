import { describe, it, expect } from 'vitest'
import {
  buildPricingIndex,
  mergePricing,
  resolveSpecialtyPricing,
  resolveSubservicePricing,
  resolvePaintingAreaPrices,
  resolveRequestedSubservico,
  getSubservices,
} from './professional-pricing'

describe('buildPricingIndex', () => {
  it('indexa por especialidade e depois por subserviço (subservico ausente/vazio = linha geral)', () => {
    const index = buildPricingIndex([
      { specialty: 'Pintura', subservico: 'paredes_interior', price_per_m2: 5 },
      { specialty: 'Pintura', subservico: 'paredes_exterior', price_per_m2: 8 },
      { specialty: 'Pintura', price_m2_ceiling: 4 }, // sem subservico -> linha geral ('')
      { specialty: 'Pavimentos e Revestimentos', subservico: 'chao_flutuante', price_per_m2: 12 },
    ])
    expect(index['Pintura']['paredes_interior']).toMatchObject({ price_per_m2: 5 })
    expect(index['Pintura']['paredes_exterior']).toMatchObject({ price_per_m2: 8 })
    expect(index['Pintura']['']).toMatchObject({ price_m2_ceiling: 4 })
    expect(index['Pavimentos e Revestimentos']['chao_flutuante']).toMatchObject({ price_per_m2: 12 })
  })

  it('devolve índice vazio para undefined/null/[] — conta sem nenhuma linha configurada ainda', () => {
    expect(buildPricingIndex(undefined)).toEqual({})
    expect(buildPricingIndex(null)).toEqual({})
    expect(buildPricingIndex([])).toEqual({})
  })

  it('ignora linhas sem especialidade válida, sem lançar', () => {
    const index = buildPricingIndex([{ specialty: null as any, price_per_m2: 1 }, { price_per_m2: 2 } as any])
    expect(index).toEqual({})
  })
})

describe('mergePricing', () => {
  it('usa a primeira fonte com o campo definido, por campo, não por objeto inteiro', () => {
    const result = mergePricing(
      { price_per_m2: 10 }, // define só price_per_m2
      { price_per_m2: 99, min_quote: 200 }, // price_per_m2 já veio da fonte anterior, min_quote vem desta
    )
    expect(result.price_per_m2).toBe(10)
    expect(result.min_quote).toBe(200)
  })

  it('salta fontes null/undefined sem lançar, e ignora campos null/undefined dentro de uma fonte', () => {
    const result = mergePricing(null, { price_per_m2: null, min_quote: 50 }, undefined, { price_per_m2: 7 })
    expect(result.price_per_m2).toBe(7)
    expect(result.min_quote).toBe(50)
  })

  it('devolve objeto vazio quando nenhuma fonte define nada', () => {
    expect(mergePricing(null, undefined, {})).toEqual({})
  })
})

describe('resolveSpecialtyPricing', () => {
  const legacy = { price_per_m2: 4, min_quote: 100 }

  it('usa a linha geral da especialidade quando existe', () => {
    const result = resolveSpecialtyPricing(legacy, { '': { price_per_m2: 30, min_quote: 500 } })
    expect(result).toMatchObject({ price_per_m2: 30, min_quote: 500 })
  })

  it('cai no legacy campo-a-campo quando a linha geral só define alguns campos', () => {
    const result = resolveSpecialtyPricing(legacy, { '': { price_per_m2: 30 } }) // sem min_quote
    expect(result.price_per_m2).toBe(30) // da linha geral
    expect(result.min_quote).toBe(100) // caiu no legacy, não ficou vazio
  })

  it('cai inteiramente no legacy quando não há nenhuma linha para esta especialidade', () => {
    expect(resolveSpecialtyPricing(legacy, undefined)).toMatchObject(legacy)
    expect(resolveSpecialtyPricing(legacy, {})).toMatchObject(legacy)
  })
})

describe('resolveSubservicePricing — ordem: subserviço → linha geral → legacy (regra ditada 2026-09-18)', () => {
  const legacy = { price_per_m2: 4, min_quote: 100 }
  const specialtyRows = {
    '': { price_per_m2: 20, min_quote: 300 },
    chao_flutuante: { price_per_m2: 35 },
    remocao_pavimento: { price_per_m2: 8 },
  }

  it('usa a linha do subserviço pedido quando existe', () => {
    const result = resolveSubservicePricing(legacy, specialtyRows, 'chao_flutuante')
    expect(result.price_per_m2).toBe(35)
  })

  it('nunca usa o preço de OUTRO subserviço da mesma especialidade (rodapés não pode herdar chão flutuante)', () => {
    const result = resolveSubservicePricing(legacy, specialtyRows, 'remocao_pavimento')
    expect(result.price_per_m2).toBe(8)
    expect(result.price_per_m2).not.toBe(35)
  })

  it('subserviço sem linha própria (ex: min_quote) cai na linha geral da especialidade, não direto no legacy', () => {
    const result = resolveSubservicePricing(legacy, specialtyRows, 'chao_flutuante')
    expect(result.min_quote).toBe(300) // da linha geral, não os 100 do legacy
  })

  it('sem subserviço pedido (null), resolve ao nível da especialidade (mesmo resultado de resolveSpecialtyPricing)', () => {
    const result = resolveSubservicePricing(legacy, specialtyRows, null)
    expect(result).toEqual(resolveSpecialtyPricing(legacy, specialtyRows))
  })

  it('subserviço pedido mas sem NENHUMA configuração (nem subserviço, nem geral) cai no legacy', () => {
    const result = resolveSubservicePricing(legacy, {}, 'chao_flutuante')
    expect(result).toMatchObject(legacy)
  })
})

describe('resolvePaintingAreaPrices — paredes/tetos/exterior nunca se misturam', () => {
  it('cada área usa o seu próprio subserviço, mesmo com os 3 configurados em simultâneo', () => {
    const index = {
      Pintura: {
        paredes_interior: { price_per_m2: 5 },
        paredes_exterior: { price_per_m2: 8 },
        tetos: { price_per_m2: 6 },
      },
    }
    const result = resolvePaintingAreaPrices({}, index['Pintura'])
    expect(result).toEqual({ price_m2_walls: 5, price_m2_ceiling: 6, price_m2_exterior: 8 })
  })

  it('área sem subserviço configurado cai na linha geral da especialidade, não na de outra área', () => {
    const specialtyRows = {
      paredes_interior: { price_per_m2: 5 },
      '': { price_m2_ceiling: 4, price_m2_exterior: 7 }, // legacy-shape na linha geral
    }
    const result = resolvePaintingAreaPrices({}, specialtyRows)
    expect(result.price_m2_walls).toBe(5) // subserviço próprio
    expect(result.price_m2_ceiling).toBe(4) // linha geral, nunca herdou os 5 das paredes
    expect(result.price_m2_exterior).toBe(7)
  })

  it('sem nenhuma linha configurada, cai inteiramente no legacy do profissional', () => {
    const professional = { price_m2_walls: 4, price_m2_ceiling: 5, price_m2_exterior: 6 }
    expect(resolvePaintingAreaPrices(professional, undefined)).toEqual({
      price_m2_walls: 4, price_m2_ceiling: 5, price_m2_exterior: 6,
    })
  })

  it('preço de Pavimentos e Revestimentos nunca contamina o de Pintura (índices de especialidades diferentes são independentes)', () => {
    const index = buildPricingIndex([
      { specialty: 'Pavimentos e Revestimentos', subservico: 'chao_flutuante', price_per_m2: 999 },
      { specialty: 'Pintura', subservico: 'paredes_interior', price_per_m2: 5 },
    ])
    const result = resolvePaintingAreaPrices({}, index['Pintura'])
    expect(result.price_m2_walls).toBe(5)
    expect(result.price_m2_walls).not.toBe(999)
  })
})

describe('resolveRequestedSubservico — só correspondências inequívocas ao questionário', () => {
  it("'Chão flutuante novo' em Pavimentos e Revestimentos mapeia para 'chao_flutuante'", () => {
    expect(resolveRequestedSubservico('Pavimentos e Revestimentos', { tipo_servico: 'Chão flutuante novo' })).toBe('chao_flutuante')
  })

  it('outras respostas de tipo_servico (sem exemplo dado) não mapeiam para nenhum subserviço — nunca inventa correspondência', () => {
    expect(resolveRequestedSubservico('Pavimentos e Revestimentos', { tipo_servico: 'Cerâmica / Porcelânico' })).toBeNull()
  })

  it('especialidades sem catálogo de subserviços devolvem null', () => {
    expect(resolveRequestedSubservico('Canalização', { tipo_trabalho: 'Fuga de água' })).toBeNull()
  })

  it('sem respostas (undefined/null), devolve null sem lançar', () => {
    expect(resolveRequestedSubservico('Pavimentos e Revestimentos', undefined)).toBeNull()
    expect(resolveRequestedSubservico('Pavimentos e Revestimentos', null)).toBeNull()
  })
})

describe('getSubservices', () => {
  it('devolve o catálogo de Pintura e de Pavimentos e Revestimentos', () => {
    expect(getSubservices('Pintura').map(s => s.key)).toEqual(['paredes_interior', 'paredes_exterior', 'tetos', 'portas_aros'])
    expect(getSubservices('Pavimentos e Revestimentos').map(s => s.key)).toEqual(['chao_flutuante', 'remocao_pavimento', 'rodapes'])
  })

  it('devolve [] para especialidades sem catálogo definido (nunca inventa subserviços)', () => {
    expect(getSubservices('Canalização')).toEqual([])
    expect(getSubservices('Especialidade Inexistente')).toEqual([])
  })
})
