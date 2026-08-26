import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isLeadAuthorized } from '@/lib/lead-authorization'
import { estimatePriceRange } from '@/lib/quote-estimate'

export const dynamic = 'force-dynamic'

function generateUniversalProposal(
  leadName: string,
  profName: string,
  specialty: string,
  descricao: string,
  min: number,
  max: number,
  answers: Record<string, any>
): string {
  const hoje = new Date().toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' })
  const prazoText = answers.prazo?.includes('Emergência') ? 'Urgência confirmada — disponível hoje'
    : answers.prazo?.includes('semana') ? 'Posso começar esta semana'
    : 'Posso agendar para breve'

  return `Olá ${leadName} 👋

Obrigado por entrar em contacto. Aqui está a minha proposta:

📋 *ORÇAMENTO — ${specialty.toUpperCase()}*
Data: ${hoje}
Profissional: ${profName}

🔧 *Serviço*: ${descricao}
${Object.entries(answers)
  .filter(([k, v]) => v && k !== 'notas' && k !== 'prazo' && k !== 'media_urls')
  .map(([k, v]) => `• ${k.replace(/_/g, ' ')}: ${v}`)
  .join('\n')}

💰 *Valor Estimado*
Entre *€${min}* e *€${max}*
_(valor final confirmado após visita/avaliação)_

⏰ *Disponibilidade*
${prazoText}

${answers.notas ? `📝 *Notas*: ${answers.notas}\n\n` : ''}Que dia lhe dá jeito para combinar os detalhes? 🗓️

_${profName} — FaçoPorTi_`
}

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

    // Usar tabela de preços da especialidade
    const { min, max, descricao } = estimatePriceRange(specialty, answers)
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
      })
      .select()
      .single()

    return NextResponse.json({ quote, proposal_text: proposalText, min, max, descricao })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
