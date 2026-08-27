// Agregação de fiabilidade/capacidade/conversão/resposta por profissional —
// extraído de app/api/professionals/reliability/route.ts para poder ser
// chamado diretamente por páginas server-side (ex: /profissionais/
// [especialidade]) sem um round-trip HTTP a si própria. A rota da API
// (usada pelo /profissionais client-side) passa a chamar isto também,
// nunca duplica o cálculo.

import { supabaseAdmin } from '@/lib/supabase-admin'
import { computeReliabilityScore } from '@/lib/reliability'
import { countActiveLeads } from '@/lib/capacity'
import { computeConversionRate, computeAvgResponseHours } from '@/lib/conversion'
import type { ReliabilityScoresById } from '@/lib/professional-ranking'

type LeadRow = { status: string | null; created_at: string; opened_at: string | null }

/**
 * Nunca devolve linhas de leads nem qualquer dado pessoal de cliente — só os
 * agregados numéricos por profissional. supabaseAdmin é necessário porque
 * `leads` tem RLS que bloqueia leitura sem sessão (correto, é isto que
 * protege os dados pessoais); esta função nunca reencaminha o que lê.
 */
export async function buildReliabilityScores(): Promise<ReliabilityScoresById> {
  const { data: leads, error } = await supabaseAdmin
    .from('leads')
    .select('professional_id, status, created_at, opened_at')
    .not('professional_id', 'is', null)

  if (error) throw new Error(error.message)

  const byProfessional = new Map<string, LeadRow[]>()
  for (const lead of leads || []) {
    const list = byProfessional.get(lead.professional_id as string) ?? []
    list.push({ status: lead.status, created_at: lead.created_at, opened_at: lead.opened_at })
    byProfessional.set(lead.professional_id as string, list)
  }

  const scores: ReliabilityScoresById = {}
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
  return scores
}
