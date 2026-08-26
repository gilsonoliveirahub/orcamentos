import { describe, it, expect } from 'vitest'
import { summarizeAIVisibility, FUTURE_AI_VISIBILITY_METRICS } from './ai-visibility'

describe('summarizeAIVisibility', () => {
  it('sem nenhuma visita com canal "ia": zero, nunca inventa um número', () => {
    const result = summarizeAIVisibility([{ origin_channel: 'facebook', event_count: 10 }])
    expect(result.observedReferralCount).toBe(0)
    expect(result.methodology).toBe('referrer_utm_only')
  })

  it('lê corretamente a contagem do canal "ia" quando existe', () => {
    const result = summarizeAIVisibility([
      { origin_channel: 'ia', event_count: 4 },
      { origin_channel: 'direto', event_count: 20 },
    ])
    expect(result.observedReferralCount).toBe(4)
  })

  it('lista sempre limitações — nunca apresenta o número sozinho sem contexto', () => {
    const result = summarizeAIVisibility([])
    expect(result.limitations.length).toBeGreaterThan(0)
  })
})

describe('FUTURE_AI_VISIBILITY_METRICS', () => {
  it('cada métrica futura documenta o que exigiria (custo/fornecedor), nunca finge estar ativa', () => {
    for (const metric of FUTURE_AI_VISIBILITY_METRICS) {
      expect(metric.requires.length).toBeGreaterThan(0)
    }
  })
})
