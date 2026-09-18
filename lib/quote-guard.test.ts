import { describe, it, expect } from 'vitest'
import { checkQuoteRecalculationAllowed, checkManualEditAllowed } from './quote-guard'

describe('checkQuoteRecalculationAllowed — P0 (2026-09-18)', () => {
  it('permite quando não existe nenhuma quote ainda', () => {
    expect(checkQuoteRecalculationAllowed(null)).toEqual({ blocked: false })
    expect(checkQuoteRecalculationAllowed(undefined)).toEqual({ blocked: false })
  })

  it('permite quando a quote existente está em rascunho e foi calculada automaticamente', () => {
    expect(checkQuoteRecalculationAllowed({ status: 'rascunho', value_source: 'calculated' })).toEqual({ blocked: false })
  })

  it('permite quando a quote existente é "legacy" (registo antigo, ainda em rascunho)', () => {
    expect(checkQuoteRecalculationAllowed({ status: 'rascunho', value_source: 'legacy' })).toEqual({ blocked: false })
  })

  it('bloqueia quando o status é "enviado"', () => {
    const result = checkQuoteRecalculationAllowed({ status: 'enviado', value_source: 'calculated' })
    expect(result.blocked).toBe(true)
    if (result.blocked) expect(result.message).toMatch(/enviada/i)
  })

  it('bloqueia quando o status é "aceite"', () => {
    const result = checkQuoteRecalculationAllowed({ status: 'aceite', value_source: 'calculated' })
    expect(result.blocked).toBe(true)
  })

  it('bloqueia quando value_source é "manual", mesmo em rascunho', () => {
    const result = checkQuoteRecalculationAllowed({ status: 'rascunho', value_source: 'manual' })
    expect(result.blocked).toBe(true)
    if (result.blocked) expect(result.message).toMatch(/editado manualmente/i)
  })

  it('prioriza o bloqueio por status sobre o de value_source quando os dois se aplicam', () => {
    // Uma proposta enviada com um valor que tinha sido editado manualmente
    // antes de ser enviada — a mensagem relevante agora é "já foi enviada",
    // não "foi editado manualmente" (o envio é o estado mais recente/definitivo).
    const result = checkQuoteRecalculationAllowed({ status: 'enviado', value_source: 'manual' })
    expect(result.blocked).toBe(true)
    if (result.blocked) expect(result.message).toMatch(/enviada/i)
  })

  it('não existe coluna value_source ainda (antes da migração ser aplicada): trata como não-manual, não bloqueia por esse motivo', () => {
    // Coluna inexistente -> undefined. Não deve ser confundido com 'manual'.
    const result = checkQuoteRecalculationAllowed({ status: 'rascunho', value_source: undefined })
    expect(result.blocked).toBe(false)
  })
})

describe('checkManualEditAllowed — P2 (2026-09-18): rever/alterar/substituir o valor à mão', () => {
  it('permite quando não existe nenhuma quote ainda', () => {
    expect(checkManualEditAllowed(null)).toEqual({ blocked: false })
    expect(checkManualEditAllowed(undefined)).toEqual({ blocked: false })
  })

  it('permite substituir um valor CALCULADO automaticamente (o profissional decide corrigir)', () => {
    expect(checkManualEditAllowed({ status: 'rascunho', value_source: 'calculated' })).toEqual({ blocked: false })
  })

  it('permite editar de novo um valor já MANUAL (o profissional revê a sua própria edição anterior) — diferente de checkQuoteRecalculationAllowed, que bloquearia isto', () => {
    expect(checkManualEditAllowed({ status: 'rascunho', value_source: 'manual' })).toEqual({ blocked: false })
  })

  it('bloqueia quando o status é "enviado"', () => {
    const result = checkManualEditAllowed({ status: 'enviado', value_source: 'calculated' })
    expect(result.blocked).toBe(true)
    if (result.blocked) expect(result.message).toMatch(/enviada/i)
  })

  it('bloqueia quando o status é "aceite"', () => {
    const result = checkManualEditAllowed({ status: 'aceite', value_source: 'manual' })
    expect(result.blocked).toBe(true)
  })
})
