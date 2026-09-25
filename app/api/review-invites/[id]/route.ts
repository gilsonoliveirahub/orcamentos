import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createClient } from '@/lib/supabase-server'
import { verifyInviteToken } from '@/lib/review-token'
import { sendInviteMessage } from '@/lib/send-review-invite'

export const runtime = 'nodejs'

async function getAuthenticatedProfessional() {
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return null

  const { data: professional } = await supabaseAdmin
    .from('professionals')
    .select('id, name')
    .eq('user_id', user.id)
    .maybeSingle()

  return professional
}

// Só o token prova posse do link — ao contrário do fluxo de leads (que tem
// um caminho alternativo por telefone/sessão do cliente), aqui não há
// nenhum outro sinal de identidade possível: o convite nem sequer existe
// numa tabela que o cliente já teria visto noutro sítio.
function isAuthorizedInvitee(inviteId: string, token: string | null): boolean {
  if (!token) return false
  const secret = process.env.REVIEW_TOKEN_SECRET
  return !!secret && verifyInviteToken(inviteId, token, secret)
}

// Estado FECHADO — o link deixa de funcionar mesmo com token válido (o HMAC
// é só um cálculo, continua sempre "válido" tecnicamente). Nunca reaberto.
const CLOSED_INVITE_STATUSES = new Set(['cancelled'])

// GET — busca info do convite para a página de avaliação
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const token = req.nextUrl.searchParams.get('token')

  if (!isAuthorizedInvitee(id, token)) {
    return NextResponse.json({ error: 'Link inválido' }, { status: 403 })
  }

  const { data: invite } = await supabaseAdmin
    .from('review_invites')
    .select('id, client_name, professional_id, status')
    .eq('id', id)
    .maybeSingle()

  if (!invite) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  // Convite cancelado — o link antigo tem de ficar inválido a partir daqui.
  // A página pública (app/avaliar-convite/[id]/page.tsx) já trata qualquer
  // resposta não-OK como "Link inválido", por isso não precisa de nenhum
  // estado novo do lado dela.
  if (CLOSED_INVITE_STATUSES.has(invite.status)) {
    return NextResponse.json({ error: 'Este convite já não está disponível.' }, { status: 410 })
  }

  const { data: prof } = await supabaseAdmin
    .from('professionals')
    .select('name, slug, avatar_url, specialty')
    .eq('id', invite.professional_id)
    .maybeSingle()

  return NextResponse.json({
    invite: { id: invite.id, client_name: invite.client_name },
    professional: prof,
    already_reviewed: invite.status === 'completed',
  })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { rating, comment, client_name, token } = await req.json()

    if (!rating || !client_name) {
      return NextResponse.json({ error: 'Dados em falta' }, { status: 400 })
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'Avaliação inválida' }, { status: 400 })
    }

    if (!isAuthorizedInvitee(id, token ?? null)) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    const { data: invite } = await supabaseAdmin
      .from('review_invites')
      .select('id, professional_id, status')
      .eq('id', id)
      .maybeSingle()

    if (!invite) return NextResponse.json({ error: 'Convite não encontrado' }, { status: 404 })

    if (CLOSED_INVITE_STATUSES.has(invite.status)) {
      return NextResponse.json({ error: 'Este convite já não está disponível.' }, { status: 410 })
    }

    // Impede duplicados — mesmo padrão do fluxo de leads: check aqui (boa
    // mensagem no caminho feliz) + constraint única em BD como última linha
    // de defesa atómica contra dois submits simultâneos do mesmo convite.
    if (invite.status === 'completed') {
      return NextResponse.json({ error: 'Já avaliaste este serviço' }, { status: 409 })
    }

    const { data: review, error } = await supabaseAdmin
      .from('reviews')
      .insert({
        professional_id: invite.professional_id,
        invite_id: invite.id,
        source: 'convidado',
        client_name: client_name.trim(),
        rating,
        comment: comment?.trim() || null,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Já avaliaste este serviço' }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    await supabaseAdmin
      .from('review_invites')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', invite.id)

    return NextResponse.json({ review })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

const PATCH_ACTIONS = ['confirm', 'reject', 'resend', 'cancel'] as const
type PatchAction = typeof PATCH_ACTIONS[number]

// PATCH — todas as ações do profissional sobre UM convite/pedido seu.
// Cada ação só é aceite a partir do estado certo (nunca confia só no
// pedido, volta sempre a confirmar o estado atual em BD antes de agir) e só
// sobre um convite que seja mesmo dele — nunca aceita um id de outro
// profissional.
//
//   confirm/reject — pedido submetido por um visitante ('requested'):
//     confirmar dispara o envio (email/WhatsApp), rejeitar só marca o
//     estado, nunca envia nada.
//   resend — reenvia a MESMA mensagem/link de um convite já enviado
//     ('pending') — o token é sempre o mesmo (HMAC determinístico), por
//     isso reenviar não cria nada novo, só tenta outra vez. Um lock
//     atómico (send_status → 'sending') impede que dois pedidos em
//     simultâneo (dois cliques, duas abas) disparem dois envios para o
//     mesmo convite.
//   cancel — invalida um convite ainda pendente ('pending' → 'cancelled').
//     O link antigo passa a ser recusado por GET/POST acima, mesmo sendo
//     o token tecnicamente válido.
//
// De propósito, NÃO há nenhuma ação aqui para apagar a avaliação de um
// cliente — essa decisão nunca é só do profissional (2026-09-25).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { action } = await req.json()

    if (!PATCH_ACTIONS.includes(action)) {
      return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 })
    }

    const professional = await getAuthenticatedProfessional()
    if (!professional) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

    const { data: invite } = await supabaseAdmin
      .from('review_invites')
      .select('id, professional_id, client_name, channel, client_email, client_phone, status, send_status')
      .eq('id', id)
      .maybeSingle()

    if (!invite || invite.professional_id !== professional.id) {
      return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 })
    }

    return handlePatchAction(action as PatchAction, invite, professional)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

type InviteRow = { id: string; professional_id: string; client_name: string; channel: string; client_email: string | null; client_phone: string | null; status: string; send_status: string | null }

async function handlePatchAction(action: PatchAction, invite: InviteRow, professional: { id: string; name: string }) {
  if (action === 'confirm' || action === 'reject') {
    if (invite.status !== 'requested') {
      return NextResponse.json({ error: 'Este pedido já foi tratado.' }, { status: 409 })
    }
    if (action === 'reject') {
      await supabaseAdmin.from('review_invites').update({ status: 'rejected' }).eq('id', invite.id)
      return NextResponse.json({ ok: true, status: 'rejected' })
    }
    const { error: updateError } = await supabaseAdmin.from('review_invites').update({ status: 'pending' }).eq('id', invite.id)
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
    const sendError = await sendInviteMessage(invite, professional)
    return NextResponse.json({ ok: true, status: 'pending', send_error: sendError })
  }

  if (action === 'resend') {
    if (invite.status !== 'pending') {
      return NextResponse.json({ error: 'Só é possível reenviar um convite pendente.' }, { status: 409 })
    }
    // Lock atómico — só quem conseguir esta UPDATE (0 ou 1 linha) segue
    // para enviar; impede dois reenvios em simultâneo do mesmo convite.
    // Nunca fica preso em 'sending': sendInviteMessage grava sempre 'sent'
    // ou 'failed' antes de devolver, mesmo quando o envio falha.
    const { data: lockedRows, error: lockError } = await supabaseAdmin
      .from('review_invites')
      .update({ send_status: 'sending' })
      .eq('id', invite.id)
      .eq('status', 'pending')
      .or('send_status.is.null,send_status.neq.sending')
      .select('id')
    if (lockError) return NextResponse.json({ error: lockError.message }, { status: 500 })
    if (!lockedRows || lockedRows.length === 0) {
      return NextResponse.json({ error: 'Já há um reenvio em curso para este convite.' }, { status: 409 })
    }
    const sendError = await sendInviteMessage(invite, professional)
    return NextResponse.json({ ok: true, status: 'pending', send_error: sendError })
  }

  // cancel
  if (invite.status !== 'pending') {
    return NextResponse.json({ error: 'Só é possível cancelar um convite pendente.' }, { status: 409 })
  }
  const { error } = await supabaseAdmin.from('review_invites').update({ status: 'cancelled' }).eq('id', invite.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, status: 'cancelled' })
}

// Convites que já não vão a lado nenhum: rejeitados, cancelados, ou um
// pendente cujo envio falhou de vez (o profissional desiste e liberta o
// contacto para tentar de outra forma). Nunca 'requested'/'completed'
// reais — e nunca a avaliação em si, que não pode ser apagada por aqui.
function isInviteDeletable(invite: { status: string; send_status: string | null }): boolean {
  if (invite.status === 'rejected' || invite.status === 'cancelled') return true
  if (invite.status === 'pending' && invite.send_status === 'failed') return true
  return false
}

// DELETE — remove o registo do convite em si. Nunca uma avaliação: não há
// nenhuma ação neste ficheiro que apague a avaliação de um cliente.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const professional = await getAuthenticatedProfessional()
    if (!professional) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

    const { data: invite } = await supabaseAdmin
      .from('review_invites')
      .select('id, professional_id, status, send_status')
      .eq('id', id)
      .maybeSingle()

    if (!invite || invite.professional_id !== professional.id) {
      return NextResponse.json({ error: 'Convite não encontrado.' }, { status: 404 })
    }
    if (!isInviteDeletable(invite)) {
      return NextResponse.json({ error: 'Só é possível eliminar convites rejeitados, cancelados, ou pendentes cujo envio falhou.' }, { status: 409 })
    }

    const { error } = await supabaseAdmin.from('review_invites').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
