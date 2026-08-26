// Estrutura para comparar, no futuro, leads com e sem assistência de IA —
// reutiliza só funções já existentes e testadas (completude, funil,
// conversão, resposta, calibração da estimativa), nunca inventa uma métrica
// nova. Não grava nada, não decide sozinho o que é "assistido por IA" — a
// classificação (isAssisted) é sempre passada por quem chama, porque hoje
// não existe nenhum fornecedor de IA ativo (ver lib/ai-provider.ts) e por
// isso não há nenhum campo real para isto ler ainda.
//
// Sem PII adicional: usa exatamente os mesmos campos de `leads`/`quotes` já
// lidos em Stats/admin, nada novo é recolhido do cliente.

import { computeLeadCompleteness, type LeadForCompleteness } from '@/lib/lead-completeness'
import { computeProposalRate, type LeadForFunnel, type QuoteForFunnel } from '@/lib/lead-funnel'
import { computeConversionRate, computeAvgResponseHours, type LeadForResponseTime } from '@/lib/conversion'
import { buildCalibrationSamples, summarizeCalibration, type QuoteForCalibration } from '@/lib/estimate-calibration'

export type LeadForAIImpact = LeadForCompleteness & LeadForFunnel & LeadForResponseTime & {
  status: string | null
  professional_id: string | null
  valor_fechado?: number | null
}

export type QuoteForAIImpact = QuoteForFunnel & QuoteForCalibration

export const MIN_GROUP_SAMPLE = 3

export type AIImpactGroupSummary = {
  sampleSize: number
  completenessRate: number | null
  proposalRate: number | null
  fechadosCount: number
  winRate: number
  conversionRate: number | null
  avgResponseHours: number | null
  estimateAccuracy: { sampleSize: number; avgAbsErrorPercent: number } | null
}

function summarizeGroup(leads: LeadForAIImpact[], quotes: QuoteForAIImpact[]): AIImpactGroupSummary {
  const sampleSize = leads.length
  const proposal = computeProposalRate(leads, quotes)
  const fechadosCount = leads.filter(l => l.status === 'fechado').length
  const calibration = summarizeCalibration(buildCalibrationSamples(quotes, leads, []))

  return {
    sampleSize,
    completenessRate: sampleSize > 0
      ? leads.filter(l => computeLeadCompleteness(l).missingCount === 0).length / sampleSize
      : null,
    proposalRate: proposal.rate,
    fechadosCount,
    winRate: computeConversionRate(leads),
    conversionRate: sampleSize > 0 ? fechadosCount / sampleSize : null,
    avgResponseHours: computeAvgResponseHours(leads),
    estimateAccuracy: calibration
      ? { sampleSize: calibration.sampleSize, avgAbsErrorPercent: calibration.avgAbsErrorPercent }
      : null,
  }
}

export type AIImpactComparison = {
  assisted: AIImpactGroupSummary
  control: AIImpactGroupSummary
  hasEnoughData: boolean
}

/**
 * Compara dois grupos de leads (assistidos por IA vs. controlo) segundo as
 * mesmas métricas já usadas em Stats/admin. `isAssisted` é sempre fornecido
 * por quem chama — este módulo não sabe (nem precisa de saber) como essa
 * classificação é feita.
 */
export function compareAIImpact(
  leads: LeadForAIImpact[],
  quotes: QuoteForAIImpact[],
  isAssisted: (lead: LeadForAIImpact) => boolean,
  minSample: number = MIN_GROUP_SAMPLE
): AIImpactComparison {
  const assisted = summarizeGroup(leads.filter(isAssisted), quotes)
  const control = summarizeGroup(leads.filter(l => !isAssisted(l)), quotes)
  return { assisted, control, hasEnoughData: assisted.sampleSize >= minSample && control.sampleSize >= minSample }
}
