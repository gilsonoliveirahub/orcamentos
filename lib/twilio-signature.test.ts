import { describe, it, expect } from 'vitest'
import { createHmac } from 'crypto'
import { isValidTwilioSignature } from './twilio-signature'

// Assinatura de referência computada de forma independente (não reutiliza
// nenhuma função do próprio módulo), replicando o algoritmo documentado
// pela Twilio — para não testar a implementação contra ela mesma.
function referenceSignature(url: string, params: Record<string, string>, authToken: string): string {
  const data = Object.keys(params).sort().reduce((acc, key) => acc + key + params[key], url)
  return createHmac('sha1', authToken).update(data).digest('base64')
}

describe('isValidTwilioSignature', () => {
  const authToken = 'auth-token-teste'
  const url = 'https://www.example.com/api/webhook/twilio-status'
  const params = { MessageSid: 'SM123', MessageStatus: 'delivered' }

  it('assinatura correta: aceita', () => {
    const sig = referenceSignature(url, params, authToken)
    expect(isValidTwilioSignature(url, params, sig, authToken)).toBe(true)
  })

  it('assinatura errada: recusa', () => {
    expect(isValidTwilioSignature(url, params, 'assinatura-invalida', authToken)).toBe(false)
  })

  it('sem assinatura (null): recusa', () => {
    expect(isValidTwilioSignature(url, params, null, authToken)).toBe(false)
  })

  it('URL diferente da registada: recusa (mesmo com params corretos)', () => {
    const sig = referenceSignature(url, params, authToken)
    expect(isValidTwilioSignature('https://www.example.com/outra-rota', params, sig, authToken)).toBe(false)
  })

  it('parâmetro alterado depois de assinado: recusa', () => {
    const sig = referenceSignature(url, params, authToken)
    expect(isValidTwilioSignature(url, { ...params, MessageStatus: 'failed' }, sig, authToken)).toBe(false)
  })

  it('auth token errado: recusa', () => {
    const sig = referenceSignature(url, params, authToken)
    expect(isValidTwilioSignature(url, params, sig, 'outro-token')).toBe(false)
  })

  it('ordem dos parâmetros no objeto não importa (assinatura ordena sempre por chave)', () => {
    const sig = referenceSignature(url, params, authToken)
    const reordered = { MessageStatus: 'delivered', MessageSid: 'SM123' }
    expect(isValidTwilioSignature(url, reordered, sig, authToken)).toBe(true)
  })
})
