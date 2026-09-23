import { describe, it, expect } from 'vitest'
import { generateReviewToken, verifyReviewToken, generateInviteToken, verifyInviteToken } from './review-token'

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

describe('invite token', () => {
  it('gera um token válido que verifica corretamente', () => {
    const token = generateInviteToken('invite-123', SECRET)
    expect(verifyInviteToken('invite-123', token, SECRET)).toBe(true)
  })

  it('rejeita um token de um invite_id diferente', () => {
    const token = generateInviteToken('invite-123', SECRET)
    expect(verifyInviteToken('invite-456', token, SECRET)).toBe(false)
  })

  it('rejeita um token adulterado (um caractere hex trocado)', () => {
    const token = generateInviteToken('invite-123', SECRET)
    const tampered = (token[0] === 'a' ? 'b' : 'a') + token.slice(1)
    expect(verifyInviteToken('invite-123', tampered, SECRET)).toBe(false)
  })

  it('rejeita tokens não-hex ou malformados sem rebentar', () => {
    expect(verifyInviteToken('invite-123', 'not-hex-at-all', SECRET)).toBe(false)
    expect(verifyInviteToken('invite-123', '', SECRET)).toBe(false)
  })

  // Mesmo id (coincidência de UUID entre um lead e um invite nunca é
  // suposto acontecer, mas o teste garante que os dois espaços de tokens
  // nunca se cruzam mesmo que aconteça) — o prefixo "review-lead:" vs
  // "review-invite:" garante isto.
  it('um token de lead nunca é válido como token de convite com o mesmo id, e vice-versa', () => {
    const sameId = 'shared-id-123'
    const leadToken = generateReviewToken(sameId, SECRET)
    const inviteToken = generateInviteToken(sameId, SECRET)
    expect(leadToken).not.toBe(inviteToken)
    expect(verifyInviteToken(sameId, leadToken, SECRET)).toBe(false)
    expect(verifyReviewToken(sameId, inviteToken, SECRET)).toBe(false)
  })
})
