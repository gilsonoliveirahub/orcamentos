import { describe, it, expect } from 'vitest'
import { computeEffectiveAvailability, isAcceptingLeads } from './professional-availability'

describe('computeEffectiveAvailability', () => {
  it('usa availability_status diretamente quando já está definido', () => {
    expect(computeEffectiveAvailability({ availability_status: 'disponivel' })).toBe('disponivel')
    expect(computeEffectiveAvailability({ availability_status: 'parcial' })).toBe('parcial')
    expect(computeEffectiveAvailability({ availability_status: 'indisponivel' })).toBe('indisponivel')
  })

  it('cai para o comportamento antigo (accepting_leads) quando availability_status ainda não existe', () => {
    expect(computeEffectiveAvailability({ accepting_leads: false })).toBe('indisponivel')
    expect(computeEffectiveAvailability({ accepting_leads: true })).toBe('disponivel')
    expect(computeEffectiveAvailability({})).toBe('disponivel') // nunca definido = disponível, nunca penaliza por omissão
  })

  it('ignora um valor desconhecido em availability_status, cai para o fallback', () => {
    expect(computeEffectiveAvailability({ availability_status: 'lixo', accepting_leads: false })).toBe('indisponivel')
  })

  it('indisponível com available_from no futuro continua indisponível', () => {
    const now = new Date('2026-09-25T10:00:00')
    expect(computeEffectiveAvailability({ availability_status: 'indisponivel', available_from: '2026-10-01' }, now)).toBe('indisponivel')
  })

  it('indisponível com available_from já passada conta como disponível de novo', () => {
    const now = new Date('2026-10-05T10:00:00')
    expect(computeEffectiveAvailability({ availability_status: 'indisponivel', available_from: '2026-10-01' }, now)).toBe('disponivel')
  })

  it('indisponível com available_from é exatamente hoje já conta como disponível', () => {
    const now = new Date('2026-10-01T23:59:00')
    expect(computeEffectiveAvailability({ availability_status: 'indisponivel', available_from: '2026-10-01' }, now)).toBe('disponivel')
  })

  it('available_from só importa quando o estado é indisponível — nunca afeta parcial/disponível', () => {
    const now = new Date('2026-09-25T10:00:00')
    expect(computeEffectiveAvailability({ availability_status: 'parcial', available_from: '2026-10-01' }, now)).toBe('parcial')
  })

  it('data inválida em available_from nunca lança, mantém indisponível', () => {
    expect(computeEffectiveAvailability({ availability_status: 'indisponivel', available_from: 'não-é-data' })).toBe('indisponivel')
  })
})

describe('isAcceptingLeads', () => {
  it('só é falso quando o estado efetivo é indisponível', () => {
    expect(isAcceptingLeads({ availability_status: 'disponivel' })).toBe(true)
    expect(isAcceptingLeads({ availability_status: 'parcial' })).toBe(true)
    expect(isAcceptingLeads({ availability_status: 'indisponivel' })).toBe(false)
  })

  it('indisponível com available_from passada volta a aceitar', () => {
    const now = new Date('2026-10-05T10:00:00')
    expect(isAcceptingLeads({ availability_status: 'indisponivel', available_from: '2026-10-01' }, now)).toBe(true)
  })
})
