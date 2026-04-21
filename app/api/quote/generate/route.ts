export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { calculateQuote, generateProposalText } from '@/lib/calculator'

export async function POST(req: NextRequest) {
  try {
    const { lead_id } = await req.json()
    const supabase = supabaseAdmin

    const { data: lead } = await supabase
      .from('leads')
      .select('*, professionals(*)')
      .eq('id', lead_id)
      .single()

    if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })

    const professional = lead.professionals || {}

    const area_paredes = lead.q3_area_m2 || 50
    const area_tetos = lead.q8_teto ? Math.round(area_paredes * 0.3) : 0
    const quoteInput = {
      area_m2_paredes: area_paredes,
      area_m2_tetos: area_tetos,
      tipo: (lead.q1_tipo_trabalho || 'interior') as 'interior' | 'exterior' | 'ambos',
      cor_escura: !!lead.q4_cor_escura,
      fissuras: !!lead.q5_fissuras,
      mobilias: !!lead.q6_mobilias,
      primer: !!lead.q7_primer,
      prices: {
        price_m2_walls: professional.price_m2_walls || 4,
        price_m2_ceiling: professional.price_m2_ceiling || 5,
        price_m2_exterior: professional.price_m2_exterior || 6,
        extra_dark_color: professional.extra_dark_color || 1.25,
        extra_cracks: professional.extra_cracks || 6,
        extra_furniture_move: professional.extra_furniture_move || 50,
        extra_primer: professional.extra_primer || 2,
        min_quote: professional.min_quote || 150,
      },
    }

    const quoteResult = calculateQuote(quoteInput)
    const proposalText = generateProposalText(lead, quoteResult, professional)

    const { data: quote } = await supabase
      .from('quotes')
      .upsert({
        lead_id: lead.id,
        professional_id: lead.professional_id,
        area_m2: area_paredes,
        valor_base: quoteResult.valor_base,
        extras_total: quoteResult.extras_total,
        valor_final: quoteResult.valor_final,
        valor_min: quoteResult.valor_min,
        valor_max: quoteResult.valor_max,
        proposal_text: proposalText,
        status: 'rascunho',
      })
      .select()
      .single()

    return NextResponse.json({ quote, proposal_text: proposalText, breakdown: quoteResult.breakdown })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
