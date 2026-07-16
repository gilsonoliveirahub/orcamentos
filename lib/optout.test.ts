import { describe, it, expect } from 'vitest'
import {
  generateClientOptOutToken, verifyClientOptOutToken,
  generateProfessionalOptOutToken, verifyProfessionalOptOutToken,
} from './optout'

const SECRET = 'segredo-teste-fixo'

describe('client opt-out token', () => {
  it('generates a valid token that verifies correctly', () => {
    const token = generateClientOptOutToken('cliente@example.com', SECRET)
    expect(verifyClientOptOutToken('cliente@example.com', token, SECRET)).toBe(true)
  })

  it('is case-insensitive on the email (normalized before hashing)', () => {
    const token = generateClientOptOutToken('Cliente@Example.com', SECRET)
    expect(verifyClientOptOutToken('cliente@example.com', token, SECRET)).toBe(true)
  })

  it('rejects a token for a different email', () => {
    const token = generateClientOptOutToken('cliente@example.com', SECRET)
    expect(verifyClientOptOutToken('outro@example.com', token, SECRET)).toBe(false)
  })

  it('rejects a tampered token (flipped hex character)', () => {
    const token = generateClientOptOutToken('cliente@example.com', SECRET)
    const tampered = (token[0] === 'a' ? 'b' : 'a') + token.slice(1)
    expect(verifyClientOptOutToken('cliente@example.com', tampered, SECRET)).toBe(false)
  })

  it('rejects a token generated with a different secret', () => {
    const token = generateClientOptOutToken('cliente@example.com', SECRET)
    expect(verifyClientOptOutToken('cliente@example.com', token, 'outro-segredo')).toBe(false)
  })

  it('rejects non-hex or malformed tokens without throwing', () => {
    expect(verifyClientOptOutToken('cliente@example.com', 'not-hex-at-all', SECRET)).toBe(false)
    expect(verifyClientOptOutToken('cliente@example.com', '', SECRET)).toBe(false)
    expect(verifyClientOptOutToken('cliente@example.com', 'ab', SECRET)).toBe(false)
  })
})

describe('professional opt-out token', () => {
  it('generates a valid token that verifies correctly', () => {
    const token = generateProfessionalOptOutToken('prof-123', SECRET)
    expect(verifyProfessionalOptOutToken('prof-123', token, SECRET)).toBe(true)
  })

  it('rejects a token for a different professional id', () => {
    const token = generateProfessionalOptOutToken('prof-123', SECRET)
    expect(verifyProfessionalOptOutToken('prof-456', token, SECRET)).toBe(false)
  })
})

describe('namespace separation between clients and professionals', () => {
  it('a client token is never valid as a professional token for the same string value, and vice versa', () => {
    const sameValue = 'shared-value-123'
    const clientToken = generateClientOptOutToken(sameValue, SECRET)
    const profToken = generateProfessionalOptOutToken(sameValue, SECRET)

    expect(clientToken).not.toBe(profToken)
    expect(verifyProfessionalOptOutToken(sameValue, clientToken, SECRET)).toBe(false)
    expect(verifyClientOptOutToken(sameValue, profToken, SECRET)).toBe(false)
  })
})
