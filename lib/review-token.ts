import { createHmac, timingSafeEqual } from 'crypto'

// Prova de posse do link de avaliação enviado por email — sem este token
// válido, conhecer o lead_id sozinho nunca é suficiente para submeter uma
// review em /api/reviews. Isto é essencial porque o lead_id NÃO é secreto
// para o profissional (vê-o na própria dashboard, no URL de /leads/[id],
// em notificações) — sem o token, o profissional podia forjar uma
// avaliação de 5 estrelas para si mesmo só com o lead_id que já tem.
// Mesmo padrão HMAC de lib/optout.ts, segredo próprio (REVIEW_TOKEN_SECRET).
export function generateReviewToken(leadId: string, secret: string): string {
  return createHmac('sha256', secret).update(`review-lead:${leadId}`).digest('hex')
}

export function verifyReviewToken(leadId: string, token: string, secret: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(token)) return false
  const expected = generateReviewToken(leadId, secret)
  const expectedBuf = Buffer.from(expected, 'hex')
  const tokenBuf = Buffer.from(token, 'hex')
  if (expectedBuf.length !== tokenBuf.length) return false
  return timingSafeEqual(expectedBuf, tokenBuf)
}
