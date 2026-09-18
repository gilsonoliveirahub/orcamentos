import { describe, it, expect } from 'vitest'
import { CREDIT_PACKS, getCreditPack, creditPackAmountCents } from './marketplace-credits'

describe('CREDIT_PACKS — P2 (2026-09-18), valores ditados, IVA incluído', () => {
  it('tem exatamente os 4 pacotes, pela ordem 1/10/25/50 créditos', () => {
    expect(CREDIT_PACKS.map((p) => p.credits)).toEqual([1, 10, 25, 50])
  })

  it('totais e preços por lead batem exatamente com os valores ditados', () => {
    expect(getCreditPack('pack1')).toMatchObject({ totalEur: 9.90, perLeadEur: 9.90 })
    expect(getCreditPack('pack10')).toMatchObject({ totalEur: 89.10, perLeadEur: 8.91 })
    expect(getCreditPack('pack25')).toMatchObject({ totalEur: 210.38, perLeadEur: 8.42 })
    expect(getCreditPack('pack50')).toMatchObject({ totalEur: 371.25, perLeadEur: 7.43 })
  })

  it('nunca reintroduz os preços antigos (20€/45€/75€)', () => {
    const totals = CREDIT_PACKS.map((p) => p.totalEur)
    expect(totals).not.toContain(20)
    expect(totals).not.toContain(45)
    expect(totals).not.toContain(75)
  })

  it('getCreditPack devolve undefined para um id inexistente, nunca inventa um pacote', () => {
    expect(getCreditPack('pack-inexistente')).toBeUndefined()
  })
})

describe('creditPackAmountCents', () => {
  it('converte cada total em euros para cêntimos, exatamente como o Stripe exige', () => {
    expect(creditPackAmountCents(getCreditPack('pack1')!)).toBe(990)
    expect(creditPackAmountCents(getCreditPack('pack10')!)).toBe(8910)
    expect(creditPackAmountCents(getCreditPack('pack25')!)).toBe(21038)
    expect(creditPackAmountCents(getCreditPack('pack50')!)).toBe(37125)
  })
})
