import { describe, it, expect } from 'vitest'
import { computeConversionRate, computeAvgResponseHours } from './conversion'

describe('computeConversionRate', () => {
  it('sem leads: neutro (1), nunca penaliza quem não tem histórico', () => {
    expect(computeConversionRate([])).toBe(1)
  })

  it('só leads em aberto (nada decidido ainda): neutro (1)', () => {
    expect(computeConversionRate([{ status: 'novo' }, { status: 'proposta' }])).toBe(1)
  })

  it('tudo fechado: 1', () => {
    expect(computeConversionRate([{ status: 'fechado' }, { status: 'fechado' }])).toBe(1)
  })

  it('tudo perdido: 0', () => {
    expect(computeConversionRate([{ status: 'perdido' }, { status: 'perdido' }])).toBe(0)
  })

  it('mistura: 2 fechados, 2 perdidos, 1 ainda aberto -> 0.5, aberto não entra na conta', () => {
    const leads = [{ status: 'fechado' }, { status: 'fechado' }, { status: 'perdido' }, { status: 'perdido' }, { status: 'novo' }]
    expect(computeConversionRate(leads)).toBe(0.5)
  })
})

describe('computeAvgResponseHours', () => {
  it('sem leads: null (sem informação, não é o mesmo que rápido)', () => {
    expect(computeAvgResponseHours([])).toBeNull()
  })

  it('nenhum lead aberto (todos sem opened_at, ex: só marketplace): null', () => {
    const leads = [{ created_at: '2026-01-01T00:00:00Z', opened_at: null }]
    expect(computeAvgResponseHours(leads)).toBeNull()
  })

  it('um lead aberto 2h depois de criado: média = 2', () => {
    const leads = [{ created_at: '2026-01-01T00:00:00Z', opened_at: '2026-01-01T02:00:00Z' }]
    expect(computeAvgResponseHours(leads)).toBe(2)
  })

  it('média entre vários, ignora os sem opened_at', () => {
    const leads = [
      { created_at: '2026-01-01T00:00:00Z', opened_at: '2026-01-01T02:00:00Z' }, // 2h
      { created_at: '2026-01-01T00:00:00Z', opened_at: '2026-01-02T00:00:00Z' }, // 24h
      { created_at: '2026-01-01T00:00:00Z', opened_at: null }, // ignorado
    ]
    expect(computeAvgResponseHours(leads)).toBe(13)
  })
})
