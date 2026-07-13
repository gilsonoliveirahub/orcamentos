import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const runtime = 'nodejs'

// GET — busca info do lead para a página de avaliação
export async function GET(req: NextRequest) {
  const lead_id = req.nextUrl.searchParams.get('lead_id')
  if (!lead_id) return NextResponse.json({ error: 'lead_id em falta' }, { status: 400 })

  const { data: lead } = await supabaseAdmin
    .from('leads')
    .select('id, name, professional_id, status')
    .eq('id', lead_id)
    .maybeSingle()

  if (!lead) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

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
    const { lead_id, rating, comment, client_name } = await req.json()

    if (!lead_id || !rating || !client_name) {
      return NextResponse.json({ error: 'Dados em falta' }, { status: 400 })
    }
    if (rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'Avaliação inválida' }, { status: 400 })
    }

    const { data: lead } = await supabaseAdmin
      .from('leads')
      .select('id, professional_id, name')
      .eq('id', lead_id)
      .maybeSingle()

    if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })

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

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ review })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
