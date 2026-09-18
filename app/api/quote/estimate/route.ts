import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isLeadAuthorized } from '@/lib/lead-authorization'
import { estimatePriceRange, generateUniversalProposal } from '@/lib/quote-estimate'
import { getLeadSpecialty } from '@/lib/professions'
import { checkQuoteRecalculationAllowed } from '@/lib/quote-guard'

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

    // P0 (2026-09-18): nunca sobrescrever um valor já editado manualmente
    // pelo profissional, nem uma proposta já enviada/aceite pelo cliente.
    const { data: existingQuote } = await supabaseAdmin
      .from('quotes')
      .select('status, value_source')
      .eq('lead_id', lead_id)
      .maybeSingle()
    const guard = checkQuoteRecalculationAllowed(existingQuote)
    if (guard.blocked) return NextResponse.json({ error: 'blocked', message: guard.message }, { status: 409 })

    const professional = lead.professionals || {}
    // Especialidade REALMENTE pedida pelo cliente neste lead — nunca a
    // especialidade "principal" do profissional (corrige o bug em que um
    // profissional com várias especialidades recebia sempre a fórmula da
    // primeira, independentemente do que o cliente pediu).
    const specialty = getLeadSpecialty(lead)
    const answers = lead.metadata || {}

    // Usar preço próprio do profissional quando configurado (Fase 2,
    // 2026-09-15); sem isso, cai na tabela genérica por especialidade.
    const estimate = estimatePriceRange(specialty, answers, {
      price_per_m2: professional.price_per_m2,
      price_per_hour: professional.price_per_hour,
      travel_cost: professional.travel_cost,
      min_quote: professional.min_quote,
    })

    // P0 (2026-09-18): sem fórmula própria para esta especialidade e sem
    // preço do profissional (ou sem área respondida) — nunca inventar um
    // intervalo genérico (o antigo fallback "Outro" 100€–500€ foi removido
    // por completo de lib/quote-estimate.ts). A quote é gravada com valores
    // nulos; o dashboard mostra "Estimativa indisponível" em vez de um
    // número fabricado.
    if (!estimate.available) {
      const { data: quote } = await supabaseAdmin
        .from('quotes')
        .upsert({
          lead_id: lead.id,
          professional_id: lead.professional_id,
          area_m2: parseFloat(answers.area_m2) || null,
          valor_base: null,
          extras_total: 0,
          valor_final: null,
          valor_min: null,
          valor_max: null,
          proposal_text: null,
          status: 'rascunho',
          value_source: 'calculated',
        }, { onConflict: 'lead_id' })
        .select()
        .single()

      return NextResponse.json({ quote, available: false, descricao: estimate.descricao })
    }

    const { min, max, descricao } = estimate
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
        value_source: 'calculated',
      }, { onConflict: 'lead_id' })
      .select()
      .single()

    return NextResponse.json({ quote, proposal_text: proposalText, min, max, descricao, available: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
