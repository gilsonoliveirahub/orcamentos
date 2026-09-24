import { emailConviteAvaliacao } from '@/lib/email'
import { sendWhatsApp } from '@/lib/whatsapp'
import { generateInviteToken } from '@/lib/review-token'

export type InviteToSend = {
  id: string
  client_name: string
  channel: string
  client_email: string | null
  client_phone: string | null
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
      return null
    } catch (err: any) {
      console.error(`[review-invites] email não enviado (invite ${invite.id}): ${err.message}`)
      return err.message
    }
  }

  const secret = process.env.REVIEW_TOKEN_SECRET
  if (!secret) {
    const msg = 'REVIEW_TOKEN_SECRET não configurado'
    console.error(`[review-invites] ${msg} — WhatsApp não enviado (invite ${invite.id})`)
    return msg
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://façoporti.com'
  const link = `${appUrl}/avaliar-convite/${invite.id}?token=${generateInviteToken(invite.id, secret)}`
  const result = await sendWhatsApp(invite.client_phone!,
    `⭐ Olá ${invite.client_name}! *${professional.name}* convidou-te a deixar uma opinião sobre um trabalho que fez para ti.\n\n` +
    `Demora menos de 1 minuto: ${link}\n\n` +
    `Esta ligação é pessoal e só pode ser usada uma vez.`
  )
  if (result.status !== 'sent') {
    console.error(`[review-invites] WhatsApp não enviado (invite ${invite.id}): ${result.reason}`)
    return result.reason
  }
  return null
}
