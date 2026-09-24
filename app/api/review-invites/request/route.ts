import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

// POST — pedido de avaliação submetido por um visitante do perfil público
// (sem login). Cria SEMPRE em status 'requested', nunca envia nenhum email/
// WhatsApp aqui — isso só acontece depois do profissional confirmar em
// /perfil (ver PATCH em app/api/review-invites/[id]/route.ts), que é quem
// decide se o contacto foi mesmo cliente. Sem isto, qualquer visitante
// conseguiria fazer-se passar por cliente e publicar uma avaliação.
export async function POST(req: NextRequest) {
  try {
    const { professional_id, client_name, channel, client_email, client_phone } = await req.json()

    if (typeof professional_id !== 'string' || !professional_id) {
      return NextResponse.json({ error: 'Profissional em falta.' }, { status: 400 })
    }

    const { data: professional } = await supabaseAdmin
      .from('professionals')
      .select('id, active')
      .eq('id', professional_id)
      .maybeSingle()

    if (!professional || !professional.active) {
      return NextResponse.json({ error: 'Profissional não encontrado.' }, { status: 404 })
    }

    const name = typeof client_name === 'string' ? client_name.trim() : ''
    if (!name) {
      return NextResponse.json({ error: 'Indica o teu nome.' }, { status: 400 })
    }
    if (channel !== 'email' && channel !== 'whatsapp') {
      return NextResponse.json({ error: 'Escolhe um canal: email ou WhatsApp.' }, { status: 400 })
    }

    let email: string | null = null
    let phone: string | null = null

    if (channel === 'email') {
      email = typeof client_email === 'string' ? client_email.trim().toLowerCase() : ''
      if (!email) return NextResponse.json({ error: 'Indica o teu email.' }, { status: 400 })
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json({ error: 'Email inválido.' }, { status: 400 })
      }
    } else {
      const digits = typeof client_phone === 'string' ? client_phone.replace(/\D/g, '') : ''
      if (digits.length < 8) return NextResponse.json({ error: 'Indica um número de telemóvel válido.' }, { status: 400 })
      phone = digits
    }

    // Mesma proteção contra duplicados que o convite criado pelo
    // profissional — cobre 'pending' e 'requested' (constraint única em BD
    // é a última linha de defesa atómica).
    const existingQuery = supabaseAdmin
      .from('review_invites')
      .select('id')
      .eq('professional_id', professional.id)
      .in('status', ['pending', 'requested'])
    const { data: existing } = await (channel === 'email'
      ? existingQuery.ilike('client_email', email!)
      : existingQuery.eq('client_phone', phone!)
    ).maybeSingle()

    if (existing) {
      return NextResponse.json({ error: 'Já existe um pedido pendente para este contacto.', reason: 'already_pending' }, { status: 409 })
    }

    const { error } = await supabaseAdmin
      .from('review_invites')
      .insert({ professional_id: professional.id, client_name: name, channel, client_email: email, client_phone: phone, status: 'requested' })

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Já existe um pedido pendente para este contacto.', reason: 'already_pending' }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
