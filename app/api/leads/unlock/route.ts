import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { lead_id } = await req.json()

    const userClient = await createClient()
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { data: prof } = await supabaseAdmin
      .from('professionals')
      .select('id, marketplace_credits')
      .eq('user_id', user.id)
      .single()

    if (!prof) return NextResponse.json({ error: 'Profissional não encontrado' }, { status: 404 })

    if ((prof.marketplace_credits ?? 0) < 1) {
      return NextResponse.json({ error: 'Sem créditos' }, { status: 402 })
    }

    // Descontar 1 crédito e desbloquear lead
    await Promise.all([
      supabaseAdmin
        .from('professionals')
        .update({ marketplace_credits: prof.marketplace_credits - 1 })
        .eq('id', prof.id),
      supabaseAdmin
        .from('leads')
        .update({ locked: false })
        .eq('id', lead_id)
        .eq('professional_id', prof.id),
    ])

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
