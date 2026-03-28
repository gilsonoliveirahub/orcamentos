import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    // Usar session do utilizador para obter o seu professional_id
    const userClient = await createClient()
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { data: professional } = await supabaseAdmin
      .from('professionals')
      .select('id')
      .eq('user_id', user.id)
      .single()

    const { data: lead, error } = await supabaseAdmin
      .from('leads')
      .insert({
        professional_id: professional?.id,
        name: body.name || null,
        phone: body.phone || null,
        status: 'novo',
        q1_tipo_trabalho: body.q1_tipo_trabalho || null,
        q2_divisoes: body.q2_divisoes || null,
        q3_area_m2: body.q3_area_m2 ? parseFloat(body.q3_area_m2) : null,
        q4_cor_escura: body.q4_cor_escura ?? null,
        q5_fissuras: body.q5_fissuras ?? null,
        q6_mobilias: body.q6_mobilias ?? null,
        q7_primer: body.q7_primer ?? null,
        q8_teto: body.q8_teto ?? null,
        q9_prazo: body.q9_prazo || null,
        q12_notas: body.q12_notas || null,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ lead })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
