import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createClient } from '@/lib/supabase-server'
import { isLeadAuthorized } from '@/lib/lead-authorization'
import { generateUniversalProposal } from '@/lib/quote-estimate'
import { getLeadSpecialty } from '@/lib/professions'
import { checkManualEditAllowed } from '@/lib/quote-guard'

export const dynamic = 'force-dynamic'

// P2 (2026-09-18): permite ao profissional rever, alterar ou substituir o
// valor da proposta diretamente — regra de negócio explícita ("os preços
// são definidos pelo profissional, não pela plataforma"; "permitir ao
// profissional rever, alterar ou substituir o valor"). Grava sempre
// value_source: 'manual', para que nenhum recálculo automático
// (estimate/hours/generate) o substitua depois em silêncio — ver
// lib/quote-guard.ts (checkQuoteRecalculationAllowed). Só bloqueada quando a
// proposta já foi enviada/aceite pelo cliente (checkManualEditAllowed).
//
// Correção de segurança (2026-09-18, antes do commit): a primeira versão
// desta rota confiava em `lead_id` sem exigir sessão nem confirmar posse —
// qualquer pedido não autenticado com um `lead_id` adivinhado conseguia
// alterar o valor/proposta de outro profissional. Agora segue exatamente o
// mesmo padrão já usado em app/api/leads/status/route.ts (Grupo 1 da
// auditoria de segurança, 2026-08-25): sessão obrigatória, o profissional é
// resolvido a partir do `user.id` da sessão (nunca de um `professional_id`
// enviado pelo cliente), e o lead só é aceite se pertencer a esse
// profissional — mensagem genérica ("Lead não encontrado") tanto para lead
// inexistente como para lead de outra conta, para não confirmar a um
// atacante que um `lead_id` existe.
export async function POST(req: NextRequest) {
  try {
    const { lead_id, valor_final } = await req.json()
    const valor = parseFloat(valor_final)
    if (!Number.isFinite(valor) || valor <= 0) {
      return NextResponse.json({ error: 'Indica um valor válido' }, { status: 400 })
    }

    const userClient = await createClient()
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { data: professional } = await supabaseAdmin
      .from('professionals')
      .select('id, name, specialty')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!professional) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

    const { data: lead } = await supabaseAdmin
      .from('leads')
      .select('*')
      .eq('id', lead_id)
      .maybeSingle()

    if (!lead || lead.professional_id !== professional.id) {
      return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })
    }
    if (!isLeadAuthorized(lead)) return NextResponse.json({ error: 'Pedido ainda bloqueado' }, { status: 403 })

    const { data: existingQuote } = await supabaseAdmin
      .from('quotes')
      .select('status, value_source')
      .eq('lead_id', lead_id)
      .maybeSingle()
    const guard = checkManualEditAllowed(existingQuote)
    if (guard.blocked) return NextResponse.json({ error: 'blocked', message: guard.message }, { status: 409 })

    const specialty = getLeadSpecialty({ ...lead, professionals: professional })
    const answers = lead.metadata || {}
    const descricao = `${specialty} — valor definido manualmente pelo profissional`
    // min===max: generateUniversalProposal já trata este caso mostrando um
    // valor preciso ("€X"), nunca "Entre €X e €X" (mesmo padrão de
    // app/api/quote/hours/route.ts, onde o profissional também indica um
    // valor exato, não uma gama).
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
        professional_id: professional.id,
        valor_base: valor,
        extras_total: 0,
        valor_final: valor,
        valor_min: valor,
        valor_max: valor,
        proposal_text: proposalText,
        status: 'rascunho',
        value_source: 'manual',
      }, { onConflict: 'lead_id' })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ quote, proposal_text: proposalText })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
