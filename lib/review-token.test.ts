import { describe, it, expect } from 'vitest'
import { generateReviewToken, verifyReviewToken } from './review-token'

const SECRET = 'segredo-teste-fixo'

describe('review token', () => {
  it('gera um token válido que verifica corretamente', () => {
    const token = generateReviewToken('lead-123', SECRET)
    expect(verifyReviewToken('lead-123', token, SECRET)).toBe(true)
  })

  it('rejeita um token de um lead_id diferente', () => {
    const token = generateReviewToken('lead-123', SECRET)
    expect(verifyReviewToken('lead-456', token, SECRET)).toBe(false)
  })

  it('rejeita um token adulterado (um caractere hex trocado)', () => {
    const token = generateReviewToken('lead-123', SECRET)
    const tampered = (token[0] === 'a' ? 'b' : 'a') + token.slice(1)
    expect(verifyReviewToken('lead-123', tampered, SECRET)).toBe(false)
  })

  it('rejeita um token gerado com um segredo diferente', () => {
    const token = generateReviewToken('lead-123', SECRET)
    expect(verifyReviewToken('lead-123', token, 'outro-segredo')).toBe(false)
  })

  it('rejeita tokens não-hex ou malformados sem rebentar', () => {
    expect(verifyReviewToken('lead-123', 'not-hex-at-all', SECRET)).toBe(false)
    expect(verifyReviewToken('lead-123', '', SECRET)).toBe(false)
    expect(verifyReviewToken('lead-123', 'ab', SECRET)).toBe(false)
  })
})
