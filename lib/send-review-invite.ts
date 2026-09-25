import { supabaseAdmin } from '@/lib/supabase-admin'
import { emailConviteAvaliacao } from '@/lib/email'
import { sendWhatsAppTemplate } from '@/lib/whatsapp'
import { generateInviteToken } from '@/lib/review-token'

export type InviteToSend = {
  id: string
  client_name: string
  channel: string
  client_email: string | null
  client_phone: string | null
}

// Grava o estado REAL do envio — distinto do estado do convite em si
// (review_invites.status: requested/pending/completed/rejected). 'sent' só
// significa "aceite pelo provedor" (Resend ou Twilio); para WhatsApp, o
// estado passa a 'delivered'/'failed' depois, quando o status callback da
// Twilio chega (ver app/api/webhook/twilio-status/route.ts) — para email
// não há callback equivalente integrado, fica em 'sent' se o Resend aceitou.
// Nunca lança — uma falha ao gravar o estado não pode interromper a
// resposta ao chamador.
async function persistSendStatus(inviteId: string, status: 'sent' | 'failed', error: string | null, whatsappMessageSid?: string) {
  const payload: Record<string, unknown> = {
    send_status: status,
    send_error: error,
    send_status_updated_at: new Date().toISOString(),
  }
  if (whatsappMessageSid) payload.whatsapp_message_sid = whatsappMessageSid
  const { error: dbError } = await supabaseAdmin.from('review_invites').update(payload).eq('id', inviteId)
  if (dbError) console.error(`[review-invites] falha ao gravar estado de envio (invite ${inviteId}): ${dbError.message}`)
}

// Partilhado entre a criação direta de um convite pelo profissional
// (POST /api/review-invites) e a confirmação de um pedido submetido por um
// visitante do perfil público (PATCH /api/review-invites/[id]) — em ambos
// os casos o convite já existe em BD com o canal/contacto definidos, isto só
// envia a mensagem. Nunca lança — falha de envio é sempre "melhor esforço",
// devolvida como texto ao chamador em vez de interromper a resposta.
export async function sendInviteMessage(invite: InviteToSend, professional: { name: string }): Promise<string | null> {
  if (invite.channel === 'email') {
    try {
      await emailConviteAvaliacao({ profName: professional.name, clientName: invite.client_name, clientEmail: invite.client_email!, inviteId: invite.id })
      await persistSendStatus(invite.id, 'sent', null)
      return null
    } catch (err: any) {
      console.error(`[review-invites] email não enviado (invite ${invite.id}): ${err.message}`)
      await persistSendStatus(invite.id, 'failed', err.message)
      return err.message
    }
  }

  const secret = process.env.REVIEW_TOKEN_SECRET
  if (!secret) {
    const msg = 'REVIEW_TOKEN_SECRET não configurado'
    console.error(`[review-invites] ${msg} — WhatsApp não enviado (invite ${invite.id})`)
    await persistSendStatus(invite.id, 'failed', msg)
    return msg
  }

  // Modelo aprovado pela Meta, obrigatório aqui: quem recebe um convite
  // nunca escreveu primeiro ao número do FaçoPorTi, por isso nunca há uma
  // janela de 24h de conversa aberta que permita texto livre — o WhatsApp
  // recusa (ou nem entrega) mensagens de negócio fora dessa janela sem um
  // modelo aprovado. Ver lib/whatsapp.ts sendWhatsAppTemplate.
  const contentSid = process.env.TWILIO_REVIEW_INVITE_CONTENT_SID
  if (!contentSid) {
    const msg = 'TWILIO_REVIEW_INVITE_CONTENT_SID não configurado'
    console.error(`[review-invites] ${msg} — WhatsApp não enviado (invite ${invite.id}). Sem o SID do modelo aprovado pela Meta não é seguro tentar enviar (texto livre falha fora da janela de 24h).`)
    await persistSendStatus(invite.id, 'failed', msg)
    return msg
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://façoporti.com'
  const link = `${appUrl}/avaliar-convite/${invite.id}?token=${generateInviteToken(invite.id, secret)}`

  const result = await sendWhatsAppTemplate({
    to: invite.client_phone!,
    contentSid,
    // Ordem das variáveis {{1}} {{2}} {{3}} tem de bater com o modelo
    // submetido (facoporti_review_invite_v1): nome do cliente, nome do
    // profissional, link de avaliação.
    contentVariables: { '1': invite.client_name, '2': professional.name, '3': link },
    statusCallbackUrl: `${appUrl}/api/webhook/twilio-status`,
  })

  if (result.status !== 'sent') {
    console.error(`[review-invites] WhatsApp não enviado (invite ${invite.id}): ${result.reason}`)
    await persistSendStatus(invite.id, 'failed', result.reason)
    return result.reason
  }

  await persistSendStatus(invite.id, 'sent', null, result.messageSid)
  return null
}
