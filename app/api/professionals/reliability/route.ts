export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { computeReliabilityScore } from '@/lib/reliability'
import { countActiveLeads } from '@/lib/capacity'
import { computeConversionRate, computeAvgResponseHours } from '@/lib/conversion'

type LeadRow = { status: string | null; created_at: string; opened_at: string | null }

// Endpoint público (usado por /profissionais, página pública) — devolve só
// agregados por profissional (fiabilidade, capacidade, conversão e
// velocidade de resposta), nunca linhas de leads nem qualquer dado pessoal
// de cliente. supabaseAdmin é necessário aqui porque a tabela leads tem RLS
// que bloqueia leitura sem sessão (correto — é isto que protege os dados
// pessoais); esta rota nunca reencaminha o que lê, só os números do cálculo.
export async function GET() {
  try {
    const { data: leads, error } = await supabaseAdmin
      .from('leads')
      .select('professional_id, status, created_at, opened_at')
      .not('professional_id', 'is', null)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const byProfessional = new Map<string, LeadRow[]>()
    for (const lead of leads || []) {
      const list = byProfessional.get(lead.professional_id as string) ?? []
      list.push({ status: lead.status, created_at: lead.created_at, opened_at: lead.opened_at })
      byProfessional.set(lead.professional_id as string, list)
    }

    const scores: Record<string, {
      score: number; total: number; active_count: number
      conversion_rate: number; avg_response_hours: number | null
    }> = {}
    for (const [professionalId, professionalLeads] of byProfessional) {
      const { score, total } = computeReliabilityScore(professionalLeads)
      scores[professionalId] = {
        score,
        total,
        active_count: countActiveLeads(professionalLeads),
        conversion_rate: computeConversionRate(professionalLeads),
        avg_response_hours: computeAvgResponseHours(professionalLeads),
      }
    }

    return NextResponse.json({ scores })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
