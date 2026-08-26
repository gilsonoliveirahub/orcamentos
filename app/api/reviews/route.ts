import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createClient } from '@/lib/supabase-server'
import { verifyReviewToken } from '@/lib/review-token'

export const runtime = 'nodejs'

// Só aceita a avaliação (leitura ou escrita) se: (a) vier com um token de
// avaliação válido (o link enviado por email, ver lib/review-token.ts), ou
// (b) o cliente autenticado for o dono do pedido (mesmo telefone do lead).
// Conhecer o lead_id sozinho NUNCA é suficiente — o profissional vê o
// lead_id na própria dashboard, e sem esta verificação podia forjar uma
// avaliação de 5 estrelas para si mesmo.
async function isAuthorizedReviewer(leadPhone: string | null, leadId: string, token: string | null): Promise<boolean> {
  if (token) {
    const secret = process.env.REVIEW_TOKEN_SECRET
    if (secret && verifyReviewToken(leadId, token, secret)) return true
  }

  if (!leadPhone) return false

  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return false

  const { data: client } = await supabaseAdmin
    .from('clients')
    .select('phone')
    .eq('user_id', user.id)
    .maybeSingle()

  return !!client?.phone && client.phone === leadPhone
}

// GET — busca info do lead para a página de avaliação
export async function GET(req: NextRequest) {
  const lead_id = req.nextUrl.searchParams.get('lead_id')
  const token = req.nextUrl.searchParams.get('token')
  if (!lead_id) return NextResponse.json({ error: 'lead_id em falta' }, { status: 400 })

  const { data: lead } = await supabaseAdmin
    .from('leads')
    .select('id, name, phone, professional_id, status')
    .eq('id', lead_id)
    .maybeSingle()

  if (!lead) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  if (!(await isAuthorizedReviewer(lead.phone, lead_id, token))) {
    return NextResponse.json({ error: 'Link inválido' }, { status: 403 })
  }

  const { data: prof } = await supabaseAdmin
    .from('professionals')
    .select('name, slug, avatar_url, specialty')
    .eq('id', lead.professional_id)
    .maybeSingle()

  const { data: existing } = await supabaseAdmin
    .from('reviews')
    .select('id')
    .eq('lead_id', lead_id)
    .maybeSingle()

  return NextResponse.json({
    lead: { id: lead.id, name: lead.name },
    professional: prof,
    already_reviewed: !!existing,
  })
}

export async function POST(req: NextRequest) {
  try {
    const { lead_id, rating, comment, client_name, token } = await req.json()

    if (!lead_id || !rating || !client_name) {
      return NextResponse.json({ error: 'Dados em falta' }, { status: 400 })
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'Avaliação inválida' }, { status: 400 })
    }

    const { data: lead } = await supabaseAdmin
      .from('leads')
      .select('id, professional_id, name, phone')
      .eq('id', lead_id)
      .maybeSingle()

    if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })

    if (!(await isAuthorizedReviewer(lead.phone, lead_id, token ?? null))) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    // Impede duplicados
    const { data: existing } = await supabaseAdmin
      .from('reviews')
      .select('id')
      .eq('lead_id', lead_id)
      .maybeSingle()

    if (existing) return NextResponse.json({ error: 'Já avaliaste este serviço' }, { status: 409 })

    const { data: review, error } = await supabaseAdmin
      .from('reviews')
      .insert({
        professional_id: lead.professional_id,
        lead_id: lead.id,
        client_name: client_name.trim(),
        rating,
        comment: comment?.trim() || null,
      })
      .select()
      .single()

    if (error) {
      // 23505 = unique_violation (constraint reviews_lead_id_unique) — dois
      // submits simultâneos do mesmo lead_id podem passar ambos pelo
      // check acima antes de qualquer um escrever; a constraint na BD é a
      // última linha de defesa atómica contra isso.
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Já avaliaste este serviço' }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ review })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
