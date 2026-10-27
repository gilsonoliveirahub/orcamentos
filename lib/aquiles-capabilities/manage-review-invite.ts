import { supabaseAdmin } from '@/lib/supabase-admin'
import { applyReviewInviteAction, isInviteDeletable, type ReviewInvitePatchAction } from '@/lib/review-invite-actions'
import type { CapabilityDefinition, CapabilityPreview } from './types'

export const MANAGE_REVIEW_INVITE_ACTIONS = ['confirm', 'reject', 'resend', 'cancel', 'delete'] as const
export type ManageReviewInviteAction = (typeof MANAGE_REVIEW_INVITE_ACTIONS)[number]

function isKnownAction(action: unknown): action is ManageReviewInviteAction {
  return typeof action === 'string' && (MANAGE_REVIEW_INVITE_ACTIONS as readonly string[]).includes(action)
}

export type ManageReviewInviteParams = {
  invite_id: string
  action: ManageReviewInviteAction
}

type InviteRow = {
  id: string
  professional_id: string
  client_name: string
  channel: string
  client_email: string | null
  client_phone: string | null
  status: string
  send_status: string | null
}

async function fetchInvite(inviteId: string): Promise<InviteRow | null> {
  const { data } = await supabaseAdmin
    .from('review_invites')
    .select('id, professional_id, client_name, channel, client_email, client_phone, status, send_status')
    .eq('id', inviteId)
    .maybeSingle()
  return (data as InviteRow | null) || null
}

const EFFECT_BY_ACTION: Record<ManageReviewInviteAction, string> = {
  confirm: 'Envia a mensagem (email ou WhatsApp) ao cliente',
  resend: 'Reenvia a mesma mensagem (mesmo link) ao cliente',
  reject: 'Só marca como rejeitado — nunca envia nada',
  cancel: 'Invalida o link — deixa de funcionar mesmo com o token certo',
  delete: 'Remove o registo do convite (nunca a avaliação, se já existir)',
}

function blockReasonFor(action: ManageReviewInviteAction, invite: InviteRow): string | undefined {
  if (action === 'confirm' || action === 'reject') {
    if (invite.status !== 'requested') return 'Este pedido já foi tratado (só aplicável a "requested")'
  }
  if (action === 'resend' && invite.status !== 'pending') return 'Só é possível reenviar um convite pendente'
  if (action === 'cancel' && invite.status !== 'pending') return 'Só é possível cancelar um convite pendente'
  if (action === 'delete' && !isInviteDeletable(invite)) {
    return 'Só é possível eliminar convites rejeitados, cancelados, ou pendentes cujo envio falhou'
  }
  return undefined
}

async function preview(params: ManageReviewInviteParams): Promise<CapabilityPreview> {
  if (!isKnownAction(params.action)) {
    return {
      capability_id: 'manage-review-invite',
      found: false,
      not_found_reason: 'action desconhecida',
      target_summary: `Convite ${params.invite_id}`,
      changes: [],
      effects: [],
      blocked: true,
      blocked_reason: `action deve ser uma de: ${MANAGE_REVIEW_INVITE_ACTIONS.join(', ')}`,
    }
  }

  const invite = await fetchInvite(params.invite_id)
  if (!invite) {
    return {
      capability_id: 'manage-review-invite',
      found: false,
      not_found_reason: 'Convite não encontrado',
      target_summary: `Convite ${params.invite_id}`,
      changes: [],
      effects: [],
      blocked: true,
      blocked_reason: 'Convite não encontrado',
    }
  }

  const blockedReason = blockReasonFor(params.action, invite)
  const changes = params.action === 'delete'
    ? [{ field: '(linha)', before: invite.status, after: 'eliminado' }]
    : [{ field: 'status', before: invite.status, after: params.action === 'confirm' ? 'pending' : params.action === 'reject' ? 'rejected' : params.action === 'cancel' ? 'cancelled' : invite.status }]

  return {
    capability_id: 'manage-review-invite',
    found: true,
    target_summary: `Convite de ${invite.client_name} (${invite.channel})`,
    changes,
    effects: [{ label: EFFECT_BY_ACTION[params.action] }],
    blocked: !!blockedReason,
    blocked_reason: blockedReason,
  }
}

async function execute(params: ManageReviewInviteParams) {
  if (!isKnownAction(params.action)) throw new Error(`action deve ser uma de: ${MANAGE_REVIEW_INVITE_ACTIONS.join(', ')}`)

  const invite = await fetchInvite(params.invite_id)
  if (!invite) throw new Error('Convite não encontrado')

  const blockedReason = blockReasonFor(params.action, invite)
  if (blockedReason) throw new Error(blockedReason)

  if (params.action === 'delete') {
    const { error } = await supabaseAdmin.from('review_invites').delete().eq('id', invite.id)
    if (error) throw new Error(error.message)
    return { status: 'deleted' }
  }

  const { data: professional } = await supabaseAdmin.from('professionals').select('id, name').eq('id', invite.professional_id).single()
  if (!professional) throw new Error('Profissional do convite não encontrado')

  const result = await applyReviewInviteAction(params.action as ReviewInvitePatchAction, invite, professional)
  if (!result.ok) throw new Error(result.error)
  return { status: result.status, send_error: result.send_error ?? null }
}

export const manageReviewInviteCapability: CapabilityDefinition<ManageReviewInviteParams> = {
  id: 'manage-review-invite',
  actionType: 'other_sensitive',
  description: 'Confirmar/rejeitar/reenviar/cancelar/eliminar um convite de avaliação de qualquer profissional — mesmas regras de estado do fluxo normal.',
  preview,
  execute,
}
