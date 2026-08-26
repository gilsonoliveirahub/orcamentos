import { describe, it, expect } from 'vitest'
import { computeProposalRate } from './lead-funnel'

describe('computeProposalRate', () => {
  it('sem leads: rate null (sem amostra, nunca 0% enganoso)', () => {
    expect(computeProposalRate([], [])).toEqual({ rate: null, withQuote: 0, total: 0 })
  })

  it('conta só leads que têm mesmo uma linha em quotes (artefacto real, não aproximação)', () => {
    const leads = [{ id: 'l1' }, { id: 'l2' }, { id: 'l3' }]
    const quotes = [{ lead_id: 'l1' }, { lead_id: 'l3' }]
    expect(computeProposalRate(leads, quotes)).toEqual({ rate: 2 / 3, withQuote: 2, total: 3 })
  })

  it('nenhum lead com proposta gerada: rate 0 (não confundir com "sem amostra")', () => {
    const leads = [{ id: 'l1' }, { id: 'l2' }]
    expect(computeProposalRate(leads, [])).toEqual({ rate: 0, withQuote: 0, total: 2 })
  })

  it('quote de um lead que já não está na lista (ex: apagado): nunca conta a mais que o total', () => {
    const leads = [{ id: 'l1' }]
    const quotes = [{ lead_id: 'l1' }, { lead_id: 'lead-fantasma' }]
    expect(computeProposalRate(leads, quotes)).toEqual({ rate: 1, withQuote: 1, total: 1 })
  })
})
