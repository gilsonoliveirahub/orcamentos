import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { verifyInviteToken } from '@/lib/review-token'

export const runtime = 'nodejs'

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
