import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { professional_id, source, ...fields } = body

    const { data: prof } = await supabaseAdmin
      .from('professionals')
      .select('id, marketplace_credits')
      .eq('id', professional_id)
      .single()

    if (!prof) return NextResponse.json({ error: 'Profissional não encontrado' }, { status: 404 })

    // Lead do marketplace — verificar créditos
    const isMarketplace = source === 'marketplace'
    const hasCredits = (prof.marketplace_credits ?? 0) > 0
    const locked = isMarketplace && !hasCredits

    // Se tem créditos, descontar 1
    if (isMarketplace && hasCredits) {
      await supabaseAdmin
        .from('professionals')
        .update({ marketplace_credits: prof.marketplace_credits - 1 })
        .eq('id', professional_id)
    }

    const { data: lead, error } = await supabaseAdmin
      .from('leads')
      .insert({ ...fields, professional_id, source: source || 'pessoal', locked })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ lead })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
