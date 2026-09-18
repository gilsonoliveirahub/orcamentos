import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isLeadAuthorized } from '@/lib/lead-authorization'
import { generateUniversalProposal } from '@/lib/quote-estimate'
import { getLeadSpecialty } from '@/lib/professions'
import { checkQuoteRecalculationAllowed } from '@/lib/quote-guard'

export const dynamic = 'force-dynamic'

// Fase 2 (2026-09-15), decisão de negócio: profissões "por hora" (Canalização,
// Electricidade, Limpeza, Ar Condicionado, Mudanças, Carpintaria) nunca
// perguntam ao cliente quantas horas o trabalho leva — quem sabe estimar isso
// é o profissional, depois de ver o pedido. Esta rota é chamada a partir do
// rascunho da proposta (app/leads/[id]/page.tsx) quando o profissional indica
// as horas estimadas: valor = price_per_hour × horas, nunca abaixo de
// min_quote. Sem intervalo — ao contrário da estimativa genérica, aqui o
// profissional já decidiu um valor preciso, não uma gama.
export async function POST(req: NextRequest) {
  try {
    const { lead_id, horas } = await req.json()
    const horasNum = parseFloat(horas)
    if (!Number.isFinite(horasNum) || horasNum <= 0) {
      return NextResponse.json({ error: 'Indica um número de horas válido' }, { status: 400 })
    }

    const { data: lead } = await supabaseAdmin
      .from('leads')
      .select('*, professionals(*)')
      .eq('id', lead_id)
      .single()

    if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })
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
    const pricePerHour = professional.price_per_hour || 0
    if (!pricePerHour) {
      return NextResponse.json({ error: 'Define primeiro o teu preço por hora em /config' }, { status: 400 })
    }

    const valor = Math.max(Math.round(pricePerHour * horasNum * 100) / 100, professional.min_quote || 0)
    const answers = lead.metadata || {}
    // Especialidade REALMENTE pedida pelo cliente — nunca a "principal" do
    // profissional (só usada aqui para o texto da proposta, mas tem de estar
    // correta para um profissional com várias especialidades).
    const specialty = getLeadSpecialty(lead) || lead.q1_tipo_trabalho || 'Serviço'
    const descricao = `${horasNum}h × €${pricePerHour}/hora`
    const proposalText = generateUniversalProposal(
      lead.name || 'Cliente',
      professional.name || 'Profissional',
      specialty,
      descricao,
      valor,
      valor,
      answers
    )

    const { data: quote, error } = await supabaseAdmin
      .from('quotes')
      .upsert({
        lead_id: lead.id,
        professional_id: lead.professional_id,
        area_m2: null,
        horas_estimadas: horasNum,
        valor_base: valor,
        extras_total: 0,
        valor_final: valor,
        valor_min: valor,
        valor_max: valor,
        proposal_text: proposalText,
        status: 'rascunho',
        value_source: 'calculated',
      }, { onConflict: 'lead_id' })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ quote, proposal_text: proposalText })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
