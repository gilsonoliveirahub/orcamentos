const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN
const FROM = `whatsapp:${process.env.TWILIO_WHATSAPP_FROM || '+14155238886'}`

export type WhatsAppResult =
  | { status: 'sent' }
  | { status: 'failed'; reason: string }
  | { status: 'skipped'; reason: string }

// Mostra só os últimos 4 dígitos — nunca o número completo nem a mensagem
function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, '')
  return digits.length > 4 ? `${'*'.repeat(digits.length - 4)}${digits.slice(-4)}` : '****'
}

export async function sendWhatsApp(to: string, message: string): Promise<WhatsAppResult> {
  if (!TWILIO_SID || !TWILIO_TOKEN) {
    console.error(`[whatsapp] credenciais Twilio em falta — envio para ${maskPhone(to)} ignorado`)
    return { status: 'skipped', reason: 'missing_credentials' }
  }

  const phone = to.replace(/\D/g, '')
  if (!phone || phone.length < 8) {
    console.error(`[whatsapp] número inválido (${maskPhone(to)}) — envio ignorado`)
    return { status: 'skipped', reason: 'invalid_phone' }
  }

  const toNumber = `whatsapp:+${phone}`

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64')}`,
        },
        body: new URLSearchParams({ From: FROM, To: toNumber, Body: message }).toString(),
      }
    )

    if (res.ok) return { status: 'sent' }

    // Erro devolvido pelo Twilio — regista só o código de erro, nunca o corpo da mensagem nem credenciais
    const body = await res.json().catch(() => null)
    const reason = body?.code ? `twilio_${body.code}` : `http_${res.status}`
    console.error(`[whatsapp] falha ao enviar para ${maskPhone(to)}: ${reason}`)
    return { status: 'failed', reason }
  } catch {
    console.error(`[whatsapp] erro de rede ao enviar para ${maskPhone(to)}`)
    return { status: 'failed', reason: 'network_error' }
  }
}
