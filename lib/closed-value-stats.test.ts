import { describe, it, expect } from 'vitest'
import { calcFaturacaoReal } from './closed-value-stats'

describe('calcFaturacaoReal', () => {
  it('soma só os fechados com valor_fechado informado, ignora "Prefiro não indicar" (null)', () => {
    const fechados = [
      { valor_fechado: 500 },
      { valor_fechado: null },
      { valor_fechado: 300 },
    ]
    const r = calcFaturacaoReal(fechados)
    expect(r.faturacaoReal).toBe(800)
    expect(r.comValorCount).toBe(2)
    expect(r.totalFechados).toBe(3)
  })

  it('ticket médio usa só o número de fechados com valor, não o total de fechados', () => {
    const fechados = [{ valor_fechado: 900 }, { valor_fechado: 300 }, { valor_fechado: null }, { valor_fechado: null }]
    const r = calcFaturacaoReal(fechados)
    expect(r.ticketMedio).toBe(600) // (900+300)/2, não /4
  })

  it('nunca cai para estimativa: sem nenhum valor informado, fica tudo a zero', () => {
    const fechados = [{ valor_fechado: null }, { valor_fechado: undefined }, {}]
    const r = calcFaturacaoReal(fechados)
    expect(r.faturacaoReal).toBe(0)
    expect(r.ticketMedio).toBe(0)
    expect(r.comValorCount).toBe(0)
    expect(r.totalFechados).toBe(3)
  })

  it('sem nenhum lead fechado: tudo a zero, sem divisão por zero', () => {
    const r = calcFaturacaoReal([])
    expect(r).toEqual({ faturacaoReal: 0, ticketMedio: 0, comValorCount: 0, totalFechados: 0 })
  })

  it('ignora valores inválidos (0 ou negativo) como se não estivessem informados', () => {
    const fechados = [{ valor_fechado: 0 }, { valor_fechado: -50 }, { valor_fechado: 200 }]
    const r = calcFaturacaoReal(fechados)
    expect(r.faturacaoReal).toBe(200)
    expect(r.comValorCount).toBe(1)
    expect(r.totalFechados).toBe(3)
  })
})
