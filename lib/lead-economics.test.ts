import { describe, it, expect } from 'vitest'
import { summarizeLeadEconomics, LEAD_COST_DATA_GAP } from './lead-economics'

describe('summarizeLeadEconomics', () => {
  it('sem leads: tudo a zero/null, nunca inventa uma taxa de sucesso', () => {
    expect(summarizeLeadEconomics([])).toEqual({
      acquiredCount: 0, fechadosCount: 0, totalValueGenerated: 0, avgValuePerAcquired: null, successRate: null,
    })
  })

  it('só conta como "adquirido" leads do marketplace com professional_id preenchido', () => {
    const leads = [
      { source: 'marketplace', professional_id: 'p1', status: 'novo', valor_fechado: null },
      { source: 'marketplace', professional_id: null, status: 'novo', valor_fechado: null }, // ainda não adquirido
      { source: 'pessoal', professional_id: 'p1', status: 'fechado', valor_fechado: 500 }, // não é marketplace
    ]
    expect(summarizeLeadEconomics(leads).acquiredCount).toBe(1)
  })

  it('valor médio por adquirido divide pelo total adquirido, não só pelos fechados', () => {
    const leads = [
      { source: 'marketplace', professional_id: 'p1', status: 'fechado', valor_fechado: 400 },
      { source: 'marketplace', professional_id: 'p1', status: 'perdido', valor_fechado: null },
    ]
    const result = summarizeLeadEconomics(leads)
    expect(result.acquiredCount).toBe(2)
    expect(result.fechadosCount).toBe(1)
    expect(result.totalValueGenerated).toBe(400)
    expect(result.avgValuePerAcquired).toBe(200) // 400/2, não 400/1
    expect(result.successRate).toBe(0.5)
  })

  it('fechado sem valor_fechado informado ("Prefiro não indicar") não soma ao valor gerado', () => {
    const leads = [{ source: 'marketplace', professional_id: 'p1', status: 'fechado', valor_fechado: null }]
    const result = summarizeLeadEconomics(leads)
    expect(result.fechadosCount).toBe(1)
    expect(result.totalValueGenerated).toBe(0)
  })
})

describe('LEAD_COST_DATA_GAP', () => {
  it('marca explicitamente que o custo por lead não é calculável, nunca finge um valor', () => {
    expect(LEAD_COST_DATA_GAP.available).toBe(false)
    expect(LEAD_COST_DATA_GAP.reason.length).toBeGreaterThan(0)
  })
})
