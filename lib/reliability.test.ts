import { describe, it, expect } from 'vitest'
import { computeReliabilityScore, isAbandonedLead, ABANDONED_THRESHOLD_DAYS } from './reliability'

const NOW = new Date('2026-08-26T00:00:00Z')
function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 86400000).toISOString()
}

describe('isAbandonedLead', () => {
  it('nunca é abandonado se já está fechado ou perdido, independentemente da idade', () => {
    expect(isAbandonedLead({ status: 'fechado', created_at: daysAgo(9999) }, NOW)).toBe(false)
    expect(isAbandonedLead({ status: 'perdido', created_at: daysAgo(9999) }, NOW)).toBe(false)
  })

  it('em aberto e recente (dentro do limite): não é abandonado', () => {
    expect(isAbandonedLead({ status: 'novo', created_at: daysAgo(ABANDONED_THRESHOLD_DAYS - 1) }, NOW)).toBe(false)
  })

  it('em aberto e antigo (acima do limite): é abandonado', () => {
    expect(isAbandonedLead({ status: 'proposta', created_at: daysAgo(ABANDONED_THRESHOLD_DAYS + 1) }, NOW)).toBe(true)
  })
})

describe('computeReliabilityScore', () => {
  it('sem leads: score neutro (1), nunca penaliza quem não tem histórico', () => {
    expect(computeReliabilityScore([], NOW)).toEqual({ score: 1, resolved: 0, abandoned: 0, pending: 0, total: 0 })
  })

  it('só leads recentes em aberto (sem nenhum decidido ainda): score neutro (1)', () => {
    const leads = [
      { status: 'novo', created_at: daysAgo(1) },
      { status: 'proposta', created_at: daysAgo(5) },
    ]
    const r = computeReliabilityScore(leads, NOW)
    expect(r.score).toBe(1)
    expect(r.pending).toBe(2)
    expect(r.resolved).toBe(0)
    expect(r.abandoned).toBe(0)
  })

  it('tudo fechado: score 1', () => {
    const leads = [{ status: 'fechado', created_at: daysAgo(100) }, { status: 'fechado', created_at: daysAgo(200) }]
    expect(computeReliabilityScore(leads, NOW).score).toBe(1)
  })

  it('tudo abandonado (velho e nunca resolvido): score 0', () => {
    const leads = [
      { status: 'novo', created_at: daysAgo(60) },
      { status: 'qualificado', created_at: daysAgo(90) },
    ]
    const r = computeReliabilityScore(leads, NOW)
    expect(r.score).toBe(0)
    expect(r.abandoned).toBe(2)
  })

  it('mistura: 3 resolvidos, 1 abandonado, 1 ainda pendente -> score = 3/4, pendente não entra na conta', () => {
    const leads = [
      { status: 'fechado', created_at: daysAgo(50) },
      { status: 'perdido', created_at: daysAgo(60) },
      { status: 'fechado', created_at: daysAgo(70) },
      { status: 'proposta', created_at: daysAgo(40) }, // abandonado
      { status: 'novo', created_at: daysAgo(2) }, // pendente, recente
    ]
    const r = computeReliabilityScore(leads, NOW)
    expect(r.resolved).toBe(3)
    expect(r.abandoned).toBe(1)
    expect(r.pending).toBe(1)
    expect(r.score).toBe(0.75)
    expect(r.total).toBe(5)
  })

  it('status null (dado legado) tratado como em aberto, não como resolvido', () => {
    const leads = [{ status: null, created_at: daysAgo(60) }]
    const r = computeReliabilityScore(leads, NOW)
    expect(r.abandoned).toBe(1)
    expect(r.resolved).toBe(0)
  })
})
