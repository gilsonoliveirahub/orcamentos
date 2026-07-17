import { describe, it, expect } from 'vitest'
import { isLeadAuthorized } from './lead-authorization'

describe('isLeadAuthorized', () => {
  it('lead do link pessoal já aberto: autorizado', () => {
    expect(isLeadAuthorized({ opened_at: '2026-07-01T00:00:00Z', source: 'pessoal', locked: false })).toBe(true)
  })

  it('lead do link pessoal ainda não aberto: não autorizado', () => {
    expect(isLeadAuthorized({ opened_at: null, source: 'pessoal', locked: false })).toBe(false)
  })

  it('lead do marketplace adquirido (locked=false): autorizado mesmo sem opened_at', () => {
    expect(isLeadAuthorized({ opened_at: null, source: 'marketplace', locked: false })).toBe(true)
  })

  it('lead do marketplace ainda bloqueado (locked=true): não autorizado', () => {
    expect(isLeadAuthorized({ opened_at: null, source: 'marketplace', locked: true })).toBe(false)
  })

  it('opened_at tem sempre prioridade — mesmo um lead marketplace locked=true, se alguma vez foi aberto, fica autorizado', () => {
    expect(isLeadAuthorized({ opened_at: '2026-07-01T00:00:00Z', source: 'marketplace', locked: true })).toBe(true)
  })
})
