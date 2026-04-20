import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { specialty, zone_requested, ...fields } = body

    // Encontrar melhor profissional: mesma especialidade + zona, depois só especialidade
    let professional = null

    if (zone_requested) {
      const { data } = await supabaseAdmin
        .from('professionals')
        .select('id, marketplace_credits')
        .eq('specialty', specialty)
        .eq('active', true)
        .ilike('zone', `%${zone_requested}%`)
        .in('plan', ['starter', 'pro'])
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      professional = data
    }

    if (!professional) {
      const { data } = await supabaseAdmin
        .from('professionals')
        .select('id, marketplace_credits')
        .eq('specialty', specialty)
        .eq('active', true)
        .in('plan', ['starter', 'pro'])
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      professional = data
    }

    const isMarketplace = true
    const hasCredits = (professional?.marketplace_credits ?? 0) > 0
    const locked = professional ? !hasCredits : false

    // Descontar crédito se tiver
    if (professional && hasCredits) {
      await supabaseAdmin
        .from('professionals')
        .update({ marketplace_credits: professional.marketplace_credits - 1 })
        .eq('id', professional.id)
    }

    const { data: lead, error } = await supabaseAdmin
      .from('leads')
      .insert({
        ...fields,
        professional_id: professional?.id ?? null,
        specialty,
        zone_requested: zone_requested || null,
        source: 'marketplace',
        locked,
        status: professional ? 'novo' : 'pendente',
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    // Notificar profissional se atribuído
    if (professional && lead) {
      fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'https://orcamentos-taupe.vercel.app'}/api/notifications/lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: lead.id }),
      }).catch(() => {})
    }

    return NextResponse.json({ lead, assigned: !!professional })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
