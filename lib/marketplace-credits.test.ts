import { describe, it, expect } from 'vitest'
import { CREDIT_PACKS, getCreditPack, creditPackAmountCents } from './marketplace-credits'

describe('CREDIT_PACKS — preços 2026-10-17 (aprovados pelo proprietário, sem IVA + referência com IVA)', () => {
  it('tem exatamente os 4 pacotes, pela ordem 1/10/25/50 créditos', () => {
    expect(CREDIT_PACKS.map((p) => p.credits)).toEqual([1, 10, 25, 50])
  })

  it('baseEur (sem IVA) bate exatamente com os valores ditados', () => {
    expect(getCreditPack('pack1')).toMatchObject({ baseEur: 19 })
    expect(getCreditPack('pack10')).toMatchObject({ baseEur: 171 })
    expect(getCreditPack('pack25')).toMatchObject({ baseEur: 403.75 })
    expect(getCreditPack('pack50')).toMatchObject({ baseEur: 712.50 })
  })

  it('totalEur/perLeadEur de referência (com 23% de IVA) batem exatamente com os valores ditados', () => {
    expect(getCreditPack('pack1')).toMatchObject({ totalEur: 23.37, perLeadEur: 23.37 })
    expect(getCreditPack('pack10')).toMatchObject({ totalEur: 210.33, perLeadEur: 21.03 })
    expect(getCreditPack('pack25')).toMatchObject({ totalEur: 496.61, perLeadEur: 19.86 })
    expect(getCreditPack('pack50')).toMatchObject({ totalEur: 876.38, perLeadEur: 17.53 })
  })

  it('cada totalEur é o baseEur com 23% de IVA, arredondado ao cêntimo', () => {
    for (const pack of CREDIT_PACKS) {
      expect(pack.totalEur).toBeCloseTo(Math.round(pack.baseEur * 1.23 * 100) / 100, 2)
    }
  })

  it('nunca reintroduz os preços antigos (20€/45€/75€ ou 9,90€/89,10€/210,38€/371,25€)', () => {
    const baseValues = CREDIT_PACKS.map((p) => p.baseEur)
    const totalValues = CREDIT_PACKS.map((p) => p.totalEur)
    expect(baseValues).not.toContain(20)
    expect(baseValues).not.toContain(45)
    expect(baseValues).not.toContain(75)
    expect(totalValues).not.toContain(9.90)
    expect(totalValues).not.toContain(89.10)
    expect(totalValues).not.toContain(210.38)
    expect(totalValues).not.toContain(371.25)
  })

  it('getCreditPack devolve undefined para um id inexistente, nunca inventa um pacote', () => {
    expect(getCreditPack('pack-inexistente')).toBeUndefined()
  })
})

describe('creditPackAmountCents', () => {
  it('converte o valor SEM IVA (baseEur) para cêntimos — nunca o totalEur, para o Stripe (automatic_tax) nunca duplicar o imposto', () => {
    expect(creditPackAmountCents(getCreditPack('pack1')!)).toBe(1900)
    expect(creditPackAmountCents(getCreditPack('pack10')!)).toBe(17100)
    expect(creditPackAmountCents(getCreditPack('pack25')!)).toBe(40375)
    expect(creditPackAmountCents(getCreditPack('pack50')!)).toBe(71250)
  })
})
