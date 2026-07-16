import { createHmac, timingSafeEqual } from 'crypto'

// Dois públicos, dois namespaces — um token de cliente nunca pode ser
// confundido com um token de profissional, mesmo partilhando o mesmo
// segredo (EMAIL_OPTOUT_SECRET), porque o "assunto" entra no HMAC.
type OptOutSubject = 'client-email' | 'professional-id'

function generateToken(subject: OptOutSubject, value: string, secret: string): string {
  return createHmac('sha256', secret).update(`${subject}:${value.toLowerCase()}`).digest('hex')
}

function verifyToken(subject: OptOutSubject, value: string, token: string, secret: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(token)) return false
  const expected = generateToken(subject, value, secret)
  const expectedBuf = Buffer.from(expected, 'hex')
  const tokenBuf = Buffer.from(token, 'hex')
  if (expectedBuf.length !== tokenBuf.length) return false
  return timingSafeEqual(expectedBuf, tokenBuf)
}

// ── Clientes (identificados por email, sem conta) ──────────────────────────
export function generateClientOptOutToken(email: string, secret: string): string {
  return generateToken('client-email', email, secret)
}
export function verifyClientOptOutToken(email: string, token: string, secret: string): boolean {
  return verifyToken('client-email', email, token, secret)
}

// ── Profissionais (identificados por id, com conta) ─────────────────────────
export function generateProfessionalOptOutToken(professionalId: string, secret: string): string {
  return generateToken('professional-id', professionalId, secret)
}
export function verifyProfessionalOptOutToken(professionalId: string, token: string, secret: string): boolean {
  return verifyToken('professional-id', professionalId, token, secret)
}
