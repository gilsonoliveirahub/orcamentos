export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { calculateQuote, generateProposalText } from '@/lib/calculator'
import { isLeadAuthorized } from '@/lib/lead-authorization'
import { calcPaintingAreas, getLeadSpecialty } from '@/lib/professions'
import { checkQuoteRecalculationAllowed } from '@/lib/quote-guard'
import { buildPricingIndex, resolveSpecialtyPricing, resolvePaintingAreaPrices } from '@/lib/professional-pricing'

export async function POST(req: NextRequest) {
  try {
    const { lead_id } = await req.json()
    const supabase = supabaseAdmin

    const { data: lead } = await supabase
      .from('leads')
      .select('*, professionals(*, professional_pricing(*))')
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
    const { data: existingQuote } = await supabase
      .from('quotes')
      .select('status, value_source')
      .eq('lead_id', lead_id)
      .maybeSingle()
    const guard = checkQuoteRecalculationAllowed(existingQuote)
    if (guard.blocked) return NextResponse.json({ error: 'blocked', message: guard.message }, { status: 409 })

    const professional = lead.professionals || {}
    const metadata = lead.metadata || {}
    // P1 (2026-09-18, revisto para subserviços): preços de Pintura por
    // ÁREA — paredes/tetos/exterior são subserviços distintos
    // (paredes_interior/tetos/paredes_exterior), cada um podendo ter o seu
    // próprio price_per_m2, sem misturar o de um com o de outro. Sem linha
    // por subserviço, cai na linha geral da especialidade e depois nas
    // colunas legacy de `professionals` (compatibilidade — ver
    // lib/professional-pricing.ts). Extras (mudança de cor, fissuras,
    // deslocação, primário) e min_quote continuam ao nível da especialidade
    // — não fazem parte dos exemplos de subserviço dados, ficam na linha
    // geral.
    const specialty = getLeadSpecialty(lead)
    const pricingIndex = buildPricingIndex(professional.professional_pricing)
    const pricing = resolveSpecialtyPricing(professional, pricingIndex[specialty])
    const areaPrices = resolvePaintingAreaPrices(professional, pricingIndex[specialty])

    // q3_area_m2 já é o valor exato de paredes calculado na criação do lead
    // (ver mapAnswersToLeadFields, que grava sempre paintingAreas.area_paredes
    // quando o formulário novo é usado). q8_teto, no entanto, é só um
    // booleano ("tem teto?") — perde o valor numérico real. Para leads que
    // usaram o formulário novo (metadata.altura_paredes presente), recupera
    // o valor exato com calcPaintingAreas(metadata) — a mesma função que o
    // cliente usava antes de este cálculo passar a correr aqui. Para
    // metadata mais simples (formulário antigo) ou leads sem metadata
    // (anteriores a esta funcionalidade), mantém os fallbacks já existentes.
    const area_paredes = lead.q3_area_m2 || 50
    const area_tetos = metadata.altura_paredes
      ? calcPaintingAreas(metadata).area_tetos
      : metadata.area_m2_tetos
      ? parseFloat(metadata.area_m2_tetos) || 0
      : lead.q8_teto ? Math.round(area_paredes * 0.3) : 0
    const quoteInput = {
      area_m2_paredes: area_paredes,
      area_m2_tetos: area_tetos,
      // q1_tipo_trabalho vem do texto exato da opção escolhida no formulário
      // ('Interior'/'Exterior'/'Ambos', com maiúscula — é o que aparece como
      // tag no dashboard). calculateQuote compara em minúsculas; sem este
      // toLowerCase() a comparação falhava sempre e valor_base ficava a 0,
      // caindo sempre no min_quote (bug real encontrado no lead da Elisa Reuter).
      tipo: (lead.q1_tipo_trabalho || 'interior').toLowerCase() as 'interior' | 'exterior' | 'ambos',
      // lead.q4_cor_escura: nome físico da coluna mantido por compatibilidade
      // (ver nota em dashboard_leads(), supabase/migration_marketplace_v3_atomic.sql
      // — renomear a coluna exigia reescrever essa função de segurança).
      // Representa "mudança de cor" (branco↔cor), não literalmente "escura".
      mudanca_cor: !!lead.q4_cor_escura,
      fissuras: !!lead.q5_fissuras,
      mobilias: !!lead.q6_mobilias,
      primer: !!lead.q7_primer,
      prices: {
        price_m2_walls: areaPrices.price_m2_walls || 4,
        price_m2_ceiling: areaPrices.price_m2_ceiling || 5,
        price_m2_exterior: areaPrices.price_m2_exterior || 6,
        // pricing.extra_dark_color: nome físico do campo mantido por
        // compatibilidade (mesmo motivo da coluna original). Decisão de
        // negócio 2026-09-16: deixou de ser "+25% sobre tudo" e passou a
        // "+10% só sobre paredes" — o antigo valor por omissão (1.25) NÃO se
        // mantém, o novo é 1.10.
        extra_color_change: pricing.extra_dark_color || 1.10,
        extra_cracks: pricing.extra_cracks || 6,
        extra_furniture_move: pricing.extra_furniture_move || 50,
        extra_primer: pricing.extra_primer || 2,
        min_quote: pricing.min_quote || 150,
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
        value_source: 'calculated',
      }, { onConflict: 'lead_id' })
      .select()
      .single()

    return NextResponse.json({ quote, proposal_text: proposalText, breakdown: quoteResult.breakdown })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
