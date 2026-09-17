import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isLeadAuthorized } from '@/lib/lead-authorization'
import { estimatePriceRange, generateUniversalProposal } from '@/lib/quote-estimate'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { lead_id } = await req.json()

    const { data: lead } = await supabaseAdmin
      .from('leads')
      .select('*, professionals(*)')
      .eq('id', lead_id)
      .single()

    if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })

    // Nunca gerar um orçamento (que embute nome/telefone no texto da
    // proposta) para um lead que o profissional ainda não abriu — evita
    // contornar a proteção de dados pessoais chamando esta rota
    // diretamente, sem passar pelo gate de /api/leads/open.
    if (!isLeadAuthorized(lead)) return NextResponse.json({ error: 'Pedido ainda bloqueado' }, { status: 403 })

    const professional = lead.professionals || {}
    const specialty = professional.specialty || 'Outro'
    const answers = lead.metadata || {}

    // Usar preço próprio do profissional quando configurado (Fase 2,
    // 2026-09-15); sem isso, cai na tabela genérica por especialidade.
    const { min, max, descricao } = estimatePriceRange(specialty, answers, {
      price_per_m2: professional.price_per_m2,
      price_per_hour: professional.price_per_hour,
      travel_cost: professional.travel_cost,
      min_quote: professional.min_quote,
    })
    const proposalText = generateUniversalProposal(
      lead.name || 'Cliente',
      professional.name || 'Profissional',
      specialty,
      descricao,
      min,
      max,
      answers
    )

    const { data: quote } = await supabaseAdmin
      .from('quotes')
      .upsert({
        lead_id: lead.id,
        professional_id: lead.professional_id,
        area_m2: parseFloat(answers.area_m2) || null,
        valor_base: min,
        extras_total: 0,
        valor_final: Math.round((min + max) / 2),
        valor_min: min,
        valor_max: max,
        proposal_text: proposalText,
        status: 'rascunho',
      }, { onConflict: 'lead_id' })
      .select()
      .single()

    return NextResponse.json({ quote, proposal_text: proposalText, min, max, descricao })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
