import { describe, it, expect } from 'vitest'
import { countActiveLeads } from './capacity'

describe('countActiveLeads', () => {
  it('conta só os que não estão fechados nem perdidos', () => {
    const leads = [
      { status: 'novo' }, { status: 'qualificado' }, { status: 'proposta' },
      { status: 'fechado' }, { status: 'perdido' },
    ]
    expect(countActiveLeads(leads)).toBe(3)
  })

  it('sem leads: zero', () => {
    expect(countActiveLeads([])).toBe(0)
  })

  it('status null (dado legado) conta como em aberto', () => {
    expect(countActiveLeads([{ status: null }])).toBe(1)
  })

  it('tudo resolvido: zero em aberto', () => {
    expect(countActiveLeads([{ status: 'fechado' }, { status: 'perdido' }])).toBe(0)
  })
})
