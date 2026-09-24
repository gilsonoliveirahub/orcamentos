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

// PATCH — o profissional confirma ou rejeita um pedido de avaliação
// submetido por um visitante (status 'requested'). Confirmar dispara o
// mesmo envio de email/WhatsApp que um convite criado diretamente pelo
// profissional (ver lib/send-review-invite.ts); rejeitar só marca o estado,
// nunca envia nada. Só o próprio profissional dono do pedido pode agir
// sobre ele — nunca aceita um id de outro profissional.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { action } = await req.json()

    if (action !== 'confirm' && action !== 'reject') {
      return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 })
    }

    const professional = await getAuthenticatedProfessional()
    if (!professional) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

    const { data: invite } = await supabaseAdmin
      .from('review_invites')
      .select('id, professional_id, client_name, channel, client_email, client_phone, status')
      .eq('id', id)
      .maybeSingle()

    if (!invite || invite.professional_id !== professional.id) {
      return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 })
    }
    if (invite.status !== 'requested') {
      return NextResponse.json({ error: 'Este pedido já foi tratado.' }, { status: 409 })
    }

    if (action === 'reject') {
      await supabaseAdmin.from('review_invites').update({ status: 'rejected' }).eq('id', id)
      return NextResponse.json({ ok: true, status: 'rejected' })
    }

    const { error: updateError } = await supabaseAdmin
      .from('review_invites')
      .update({ status: 'pending' })
      .eq('id', id)
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

    const sendError = await sendInviteMessage(invite, professional)

    return NextResponse.json({ ok: true, status: 'pending', send_error: sendError })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
