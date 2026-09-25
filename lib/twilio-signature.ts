import { createHmac, timingSafeEqual } from 'crypto'

// Algoritmo oficial da Twilio para validar X-Twilio-Signature: concatena o
// URL exato do webhook (o mesmo que foi registado como callback, não o que
// vem em req.url — nunca confiar nesse, pode ser manipulado atrás de um
// proxy) com cada par chave+valor dos parâmetros do POST, por ordem
// alfabética da chave, sem separador nenhum; HMAC-SHA1 com o Auth Token;
// base64. Ver https://www.twilio.com/docs/usage/webhooks/webhooks-security.
function computeTwilioSignature(url: string, params: Record<string, string>, authToken: string): string {
  const sortedKeys = Object.keys(params).sort()
  let data = url
  for (const key of sortedKeys) data += key + params[key]
  return createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64')
}

// Comparação em tempo constante — nunca usar === numa assinatura recebida.
export function isValidTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string | null,
  authToken: string
): boolean {
  if (!signature) return false
  const expected = computeTwilioSignature(url, params, authToken)
  const expectedBuf = Buffer.from(expected)
  const signatureBuf = Buffer.from(signature)
  if (expectedBuf.length !== signatureBuf.length) return false
  return timingSafeEqual(expectedBuf, signatureBuf)
}
