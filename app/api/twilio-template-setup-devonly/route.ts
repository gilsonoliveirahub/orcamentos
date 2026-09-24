import { NextRequest, NextResponse } from 'next/server'

// ATENÇÃO: rota temporária, só para submeter UMA vez o modelo de mensagem
// WhatsApp "facoporti_review_invite_v1" à aprovação da Meta via Twilio —
// usa as credenciais Twilio só disponíveis no runtime do servidor (nunca
// lidas localmente, o Vercel não deixa "puxar" variáveis Secret). A apagar
// logo a seguir a ser usada, nunca deve ficar publicada por muito tempo.
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const SETUP_TOKEN = process.env.TWILIO_TEMPLATE_SETUP_TOKEN
  if (!SETUP_TOKEN) return NextResponse.json({ error: 'setup token não configurado' }, { status: 500 })

  const token = req.headers.get('x-setup-token')
  if (token !== SETUP_TOKEN) {
    const crypto = await import('crypto')
    const hash = (s: string) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 12)
    return NextResponse.json({
      error: 'unauthorized',
      debug: { receivedLen: token?.length ?? 0, expectedLen: SETUP_TOKEN.length, receivedHash: token ? hash(token) : null, expectedHash: hash(SETUP_TOKEN) },
    }, { status: 403 })
  }

  const SID = process.env.TWILIO_ACCOUNT_SID
  const AUTH = process.env.TWILIO_AUTH_TOKEN
  if (!SID || !AUTH) return NextResponse.json({ error: 'credenciais Twilio em falta' }, { status: 500 })
  const authHeader = 'Basic ' + Buffer.from(`${SID}:${AUTH}`).toString('base64')

  const createRes = await fetch('https://content.twilio.com/v1/Content', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader },
    body: JSON.stringify({
      friendly_name: 'facoporti_review_invite_v1',
      language: 'pt_PT',
      variables: { '1': 'Maria', '2': 'Ana Pintora', '3': 'https://xn--faoporti-t0a.com/avaliar-convite/exemplo' },
      types: {
        'twilio/text': {
          body: 'Olá {{1}}! {{2}} convidou-te a deixar uma opinião sobre um trabalho que fez para ti. Avalia aqui: {{3}}',
        },
      },
    }),
  })
  const created = await createRes.json()
  if (!createRes.ok) {
    return NextResponse.json({ step: 'create', status: createRes.status, body: created }, { status: 500 })
  }

  const approveRes = await fetch(`https://content.twilio.com/v1/Content/${created.sid}/ApprovalRequests/whatsapp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader },
    body: JSON.stringify({ name: 'facoporti_review_invite_v1', category: 'UTILITY' }),
  })
  const approval = await approveRes.json()

  return NextResponse.json({
    content_sid: created.sid,
    approval_status: approveRes.status,
    approval_body: approval,
  })
}
