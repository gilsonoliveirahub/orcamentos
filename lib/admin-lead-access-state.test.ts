import { describe, it, expect } from 'vitest'
import { getAdminLeadAccessState } from './admin-lead-access-state'

describe('getAdminLeadAccessState', () => {
  it('link pessoal aberto (opened_at preenchido) → aberto', () => {
    expect(getAdminLeadAccessState({ source: 'pessoal', opened_at: '2026-01-01T00:00:00Z', professional_id: 'p1' })).toBe('aberto')
  })

  it('link pessoal ainda não aberto → bloqueado', () => {
    expect(getAdminLeadAccessState({ source: 'pessoal', opened_at: null, professional_id: 'p1' })).toBe('bloqueado')
  })

  it('marketplace sem dono → disponivel', () => {
    expect(getAdminLeadAccessState({ source: 'marketplace', opened_at: null, professional_id: null })).toBe('disponivel')
  })

  it('marketplace adquirido → adquirido', () => {
    expect(getAdminLeadAccessState({ source: 'marketplace', opened_at: null, professional_id: 'p1' })).toBe('adquirido')
  })

  it('source nulo/desconhecido: nunca inventa um dos 4 estados', () => {
    expect(getAdminLeadAccessState({ source: null, opened_at: null, professional_id: null })).toBe('desconhecido')
  })
})
