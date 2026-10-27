import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendInviteMessage } from '@/lib/send-review-invite'

// Extraído de app/api/review-invites/[id]/route.ts para ser reutilizado
// também pela capacidade do Aquiles (lib/aquiles-capabilities/manage-review-invite.ts)
// — mesma lógica, mesmas regras de estado, nunca duas versões.

export const REVIEW_INVITE_PATCH_ACTIONS = ['confirm', 'reject', 'resend', 'cancel'] as const
export type ReviewInvitePatchAction = (typeof REVIEW_INVITE_PATCH_ACTIONS)[number]

export type ReviewInviteRow = {
  id: string
  professional_id: string
  client_name: string
  channel: string
  client_email: string | null
  client_phone: string | null
  status: string
  send_status: string | null
}

// Convites que já não vão a lado nenhum: rejeitados, cancelados, ou um
// pendente cujo envio falhou de vez (o profissional desiste e liberta o
// contacto para tentar de outra forma). Nunca 'requested'/'completed'
// reais — e nunca a avaliação em si, que não pode ser apagada por aqui.
export function isInviteDeletable(invite: { status: string; send_status: string | null }): boolean {
  if (invite.status === 'rejected' || invite.status === 'cancelled') return true
  if (invite.status === 'pending' && invite.send_status === 'failed') return true
  return false
}

export type ReviewInviteActionResult =
  | { ok: true; status: string; send_error?: string | null }
  | { ok: false; status: number; error: string }

//   confirm/reject — pedido submetido por um visitante ('requested'):
//     confirmar dispara o envio (email/WhatsApp), rejeitar só marca o
//     estado, nunca envia nada.
//   resend — reenvia a MESMA mensagem/link de um convite já enviado
//     ('pending') — lock atómico impede dois reenvios em simultâneo.
//   cancel — invalida um convite ainda pendente ('pending' → 'cancelled').
export async function applyReviewInviteAction(
  action: ReviewInvitePatchAction,
  invite: ReviewInviteRow,
  professional: { name: string }
): Promise<ReviewInviteActionResult> {
  if (action === 'confirm' || action === 'reject') {
    if (invite.status !== 'requested') {
      return { ok: false, status: 409, error: 'Este pedido já foi tratado.' }
    }
    if (action === 'reject') {
      await supabaseAdmin.from('review_invites').update({ status: 'rejected' }).eq('id', invite.id)
      return { ok: true, status: 'rejected' }
    }
    const { error: updateError } = await supabaseAdmin.from('review_invites').update({ status: 'pending' }).eq('id', invite.id)
    if (updateError) return { ok: false, status: 500, error: updateError.message }
    const sendError = await sendInviteMessage(invite, professional)
    return { ok: true, status: 'pending', send_error: sendError }
  }

  if (action === 'resend') {
    if (invite.status !== 'pending') {
      return { ok: false, status: 409, error: 'Só é possível reenviar um convite pendente.' }
    }
    const { data: lockedRows, error: lockError } = await supabaseAdmin
      .from('review_invites')
      .update({ send_status: 'sending' })
      .eq('id', invite.id)
      .eq('status', 'pending')
      .or('send_status.is.null,send_status.neq.sending')
      .select('id')
    if (lockError) return { ok: false, status: 500, error: lockError.message }
    if (!lockedRows || lockedRows.length === 0) {
      return { ok: false, status: 409, error: 'Já há um reenvio em curso para este convite.' }
    }
    const sendError = await sendInviteMessage(invite, professional)
    return { ok: true, status: 'pending', send_error: sendError }
  }

  // cancel
  if (invite.status !== 'pending') {
    return { ok: false, status: 409, error: 'Só é possível cancelar um convite pendente.' }
  }
  const { error } = await supabaseAdmin.from('review_invites').update({ status: 'cancelled' }).eq('id', invite.id)
  if (error) return { ok: false, status: 500, error: error.message }
  return { ok: true, status: 'cancelled' }
}
