import { NextRequest, NextResponse } from 'next/server'

// ATENÇÃO: rota temporária, só para submeter UMA vez o modelo de mensagem
// WhatsApp "facoporti_review_invite_v2" à aprovação da Meta via Twilio —
// usa as credenciais Twilio só disponíveis no runtime do servidor (nunca
// lidas localmente, o Vercel não deixa "puxar" variáveis Secret). A apagar
// logo a seguir a ser usada, nunca deve ficar publicada por muito tempo.
//
// v2 substitui o v1 (facoporti_review_invite_v1, Content SID
// HXbd89fcfe6ef3ca3116e0afef97663c40) e o v1-marketing (Content SID
// HXba9aaf17c247e109d15a87badf9b6c7b), ambos rejeitados pela Meta com o
// motivo "Variables can't be at the start or end of the template." — a
// variável {{3}} (link) ficava no fim do texto. O texto do v2 acrescenta
// uma linha fixa depois de {{3}} para nenhuma variável ficar no início nem
// no fim. Modelos rejeitados não podem ser editados, por isso é preciso um
// friendly_name novo — nunca reutilizar os SIDs acima.
export const dynamic = 'force-dynamic'

const TEMPLATE_NAME = 'facoporti_review_invite_v2'

export async function POST(req: NextRequest) {
  const SETUP_TOKEN = process.env.TWILIO_TEMPLATE_SETUP_TOKEN
  if (!SETUP_TOKEN) return NextResponse.json({ error: 'setup token não configurado' }, { status: 500 })

  const token = req.headers.get('x-setup-token')
  if (token !== SETUP_TOKEN) return NextResponse.json({ error: 'unauthorized' }, { status: 403 })

  const SID = process.env.TWILIO_ACCOUNT_SID
  const AUTH = process.env.TWILIO_AUTH_TOKEN
  if (!SID || !AUTH) return NextResponse.json({ error: 'credenciais Twilio em falta' }, { status: 500 })
  const authHeader = 'Basic ' + Buffer.from(`${SID}:${AUTH}`).toString('base64')

  // Idempotência: procura primeiro por um Content já criado com este
  // friendly_name — sem isto, chamar a rota duas vezes por engano criava
  // um segundo modelo (a Content API não impede nomes repetidos).
  const listRes = await fetch('https://content.twilio.com/v1/Content?PageSize=1000', {
    headers: { Authorization: authHeader },
  })
  const list = await listRes.json().catch(() => null)
  if (!listRes.ok) {
    return NextResponse.json({ step: 'list', status: listRes.status, body: list }, { status: 500 })
  }

  const existing = (list?.contents || []).find((c: { friendly_name?: string }) => c.friendly_name === TEMPLATE_NAME)
  if (existing) {
    return NextResponse.json({
      status: 'already_exists',
      content_sid: existing.sid,
      friendly_name: TEMPLATE_NAME,
    })
  }

  const createRes = await fetch('https://content.twilio.com/v1/Content', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader },
    body: JSON.stringify({
      friendly_name: TEMPLATE_NAME,
      language: 'pt_PT',
      variables: { '1': 'Maria', '2': 'Ana Pintora', '3': 'https://xn--faoporti-t0a.com/avaliar-convite/exemplo' },
      types: {
        'twilio/text': {
          body: 'Olá {{1}}! {{2}} convidou-te a deixar uma opinião sobre um trabalho que fez para ti. Avalia aqui: {{3}}\n\nObrigado por confiares no FaçoPorTi.',
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
    body: JSON.stringify({ name: TEMPLATE_NAME, category: 'UTILITY' }),
  })
  const approval = await approveRes.json()

  return NextResponse.json({
    content_sid: created.sid,
    approval_status: approveRes.status,
    approval_body: approval,
  })
}
