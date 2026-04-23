const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN
const FROM = `whatsapp:${process.env.TWILIO_WHATSAPP_FROM || '+14155238886'}`

export async function sendWhatsApp(to: string, message: string): Promise<boolean> {
  if (!TWILIO_SID || !TWILIO_TOKEN) return false

  const phone = to.replace(/\D/g, '')
  if (!phone || phone.length < 8) return false

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
    return res.ok
  } catch {
    return false
  }
}
