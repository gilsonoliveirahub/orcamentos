const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN
const FROM = `whatsapp:${process.env.TWILIO_WHATSAPP_FROM || '+14155238886'}`

export type WhatsAppResult =
  | { status: 'sent' }
  | { status: 'failed'; reason: string }
  | { status: 'skipped'; reason: string }

// Igual a WhatsAppResult, mas com o SID da mensagem no sucesso — precisamos
// dele para o status callback da Twilio (delivered/failed, chega depois,
// assíncrono) conseguir encontrar a que convite pertence. 'sent' aqui
// significa só "a Twilio aceitou para envio", nunca "entregue" — ver
// app/api/webhook/twilio-status/route.ts para o estado real.
export type WhatsAppSendResult =
  | { status: 'sent'; messageSid: string }
  | { status: 'failed'; reason: string }
  | { status: 'skipped'; reason: string }

// Mostra só os últimos 4 dígitos — nunca o número completo nem a mensagem
function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, '')
  return digits.length > 4 ? `${'*'.repeat(digits.length - 4)}${digits.slice(-4)}` : '****'
}

function normalizePhone(to: string): { toNumber: string } | { error: 'invalid_phone' } {
  const phone = to.replace(/\D/g, '')
  if (!phone || phone.length < 8) return { error: 'invalid_phone' }
  return { toNumber: `whatsapp:+${phone}` }
}

// POST partilhado ao endpoint de Messages da Twilio — usado tanto por texto
// livre (sendWhatsApp) como por modelo aprovado (sendWhatsAppTemplate).
// Nunca lança; devolve sempre um resultado tipado, incluindo o messageSid
// devolvido pela Twilio quando aceite (necessário para o status callback).
async function postTwilioMessage(to: string, bodyParams: Record<string, string>, logLabel: string): Promise<WhatsAppSendResult> {
  if (!TWILIO_SID || !TWILIO_TOKEN) {
    console.error(`[whatsapp] credenciais Twilio em falta — ${logLabel} para ${maskPhone(to)} ignorado`)
    return { status: 'skipped', reason: 'missing_credentials' }
  }

  const normalized = normalizePhone(to)
  if ('error' in normalized) {
    console.error(`[whatsapp] número inválido (${maskPhone(to)}) — ${logLabel} ignorado`)
    return { status: 'skipped', reason: 'invalid_phone' }
  }

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64')}`,
        },
        body: new URLSearchParams({ From: FROM, To: normalized.toNumber, ...bodyParams }).toString(),
      }
    )

    const parsed = await res.json().catch(() => null)

    if (res.ok) return { status: 'sent', messageSid: parsed?.sid || '' }

    // Erro devolvido pelo Twilio — regista só o código de erro, nunca o corpo da mensagem nem credenciais
    const reason = parsed?.code ? `twilio_${parsed.code}` : `http_${res.status}`
    console.error(`[whatsapp] falha ao ${logLabel} para ${maskPhone(to)}: ${reason}`)
    return { status: 'failed', reason }
  } catch {
    console.error(`[whatsapp] erro de rede ao ${logLabel} para ${maskPhone(to)}`)
    return { status: 'failed', reason: 'network_error' }
  }
}

export async function sendWhatsApp(to: string, message: string): Promise<WhatsAppResult> {
  const result = await postTwilioMessage(to, { Body: message }, 'enviar')
  if (result.status === 'sent') return { status: 'sent' }
  return result
}

/**
 * Envia usando um modelo de conteúdo já aprovado pela Meta (Twilio Content
 * API) em vez de texto livre — obrigatório para mensagens de negócio a
 * quem nunca escreveu primeiro ao número do FaçoPorTi (fora da janela de
 * 24h de conversa, o WhatsApp recusa texto livre). `contentVariables` são
 * as variáveis {{1}}, {{2}}... do modelo, na ordem em que foi criado (ver
 * supabase/... e a submissão original do modelo).
 *
 * `statusCallbackUrl`, quando fornecido, pede à Twilio para notificar essa
 * URL quando o estado real da mensagem mudar (queued → sent → delivered/
 * failed) — é o único jeito de saber se a mensagem chegou mesmo, o pedido
 * inicial só confirma que a Twilio a aceitou para a fila.
 */
export async function sendWhatsAppTemplate(params: {
  to: string
  contentSid: string
  contentVariables: Record<string, string>
  statusCallbackUrl?: string
}): Promise<WhatsAppSendResult> {
  const bodyParams: Record<string, string> = {
    ContentSid: params.contentSid,
    ContentVariables: JSON.stringify(params.contentVariables),
  }
  if (params.statusCallbackUrl) bodyParams.StatusCallback = params.statusCallbackUrl
  return postTwilioMessage(params.to, bodyParams, 'enviar modelo')
}
