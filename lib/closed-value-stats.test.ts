import { describe, it, expect } from 'vitest'
import { calcFaturacaoReal, groupFaturacaoRealByMonth } from './closed-value-stats'

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

describe('groupFaturacaoRealByMonth', () => {
  it('agrupa por mês usando updated_at (aproximação de data de fecho), soma total e conta', () => {
    const leads = [
      { status: 'fechado', updated_at: '2026-01-15T00:00:00Z', created_at: '2026-01-10T00:00:00Z', valor_fechado: 300 },
      { status: 'fechado', updated_at: '2026-01-20T00:00:00Z', created_at: '2026-01-01T00:00:00Z', valor_fechado: 200 },
      { status: 'fechado', updated_at: '2026-02-01T00:00:00Z', created_at: '2026-01-25T00:00:00Z', valor_fechado: 500 },
    ]
    expect(groupFaturacaoRealByMonth(leads)).toEqual([
      { month: '2026-01', total: 500, count: 2 },
      { month: '2026-02', total: 500, count: 1 },
    ])
  })

  it('cai para created_at quando updated_at é nulo', () => {
    const leads = [{ status: 'fechado', updated_at: null, created_at: '2026-03-05T00:00:00Z', valor_fechado: 100 }]
    expect(groupFaturacaoRealByMonth(leads)).toEqual([{ month: '2026-03', total: 100, count: 1 }])
  })

  it('ignora não-fechados e fechados sem valor informado', () => {
    const leads = [
      { status: 'novo', updated_at: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z', valor_fechado: 999 },
      { status: 'fechado', updated_at: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z', valor_fechado: null },
    ]
    expect(groupFaturacaoRealByMonth(leads)).toEqual([])
  })
})
