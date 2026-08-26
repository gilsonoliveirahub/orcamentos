// Mede a diferença entre a estimativa automática (quotes.valor_min/max/
// final) e o valor real pelo qual o trabalho foi fechado (leads.valor_fechado)
// — só isso. Não toca em nenhum motor de cálculo (lib/calculator.ts,
// lib/quote-estimate.ts) nem na margem pública de +15% do /pedir; lê os
// resultados já gravados, nunca recalcula nem sugere um ajuste automático.
//
// Um "sample" só existe quando há as três coisas: quote com valor_final,
// lead fechado, e valor_fechado realmente informado (não "Prefiro não
// indicar"). Sem isso, não há como comparar nada.

export type QuoteForCalibration = { lead_id: string; valor_min: number | null; valor_max: number | null; valor_final: number | null }
export type LeadForCalibration = { id: string; status: string | null; valor_fechado?: number | null; professional_id: string | null }
export type ProfessionalForCalibration = { id: string; specialty: string | null }

export type CalibrationSample = {
  leadId: string
  specialty: string
  valorFinal: number
  valorMin: number
  valorMax: number
  valorFechado: number
  diffAbsolute: number
  diffPercent: number
  withinRange: boolean
  above: boolean
  below: boolean
}

export function buildCalibrationSamples(
  quotes: QuoteForCalibration[],
  leads: LeadForCalibration[],
  professionals: ProfessionalForCalibration[]
): CalibrationSample[] {
  const leadsById = new Map(leads.map(l => [l.id, l]))
  const specialtyByProfessionalId = new Map(professionals.map(p => [p.id, p.specialty || 'Outro']))
  const samples: CalibrationSample[] = []

  for (const quote of quotes) {
    if (quote.valor_final == null || quote.valor_min == null || quote.valor_max == null) continue
    const lead = leadsById.get(quote.lead_id)
    if (!lead || lead.status !== 'fechado') continue
    if (typeof lead.valor_fechado !== 'number' || lead.valor_fechado <= 0) continue

    const valorFechado = lead.valor_fechado
    const diffAbsolute = valorFechado - quote.valor_final
    samples.push({
      leadId: lead.id,
      specialty: (lead.professional_id && specialtyByProfessionalId.get(lead.professional_id)) || 'Outro',
      valorFinal: quote.valor_final,
      valorMin: quote.valor_min,
      valorMax: quote.valor_max,
      valorFechado,
      diffAbsolute,
      diffPercent: (diffAbsolute / quote.valor_final) * 100,
      withinRange: valorFechado >= quote.valor_min && valorFechado <= quote.valor_max,
      above: valorFechado > quote.valor_max,
      below: valorFechado < quote.valor_min,
    })
  }

  return samples
}

export type CalibrationSummary = {
  sampleSize: number
  avgAbsErrorPercent: number
  withinRangeCount: number
  aboveCount: number
  belowCount: number
}

export function summarizeCalibration(samples: CalibrationSample[]): CalibrationSummary | null {
  if (samples.length === 0) return null
  const avgAbsErrorPercent = samples.reduce((sum, s) => sum + Math.abs(s.diffPercent), 0) / samples.length
  return {
    sampleSize: samples.length,
    avgAbsErrorPercent,
    withinRangeCount: samples.filter(s => s.withinRange).length,
    aboveCount: samples.filter(s => s.above).length,
    belowCount: samples.filter(s => s.below).length,
  }
}

export const MIN_CALIBRATION_SAMPLE = 3

export type SpecialtyCalibration = CalibrationSummary & { specialty: string }

/** Só devolve especialidades com amostra mínima — nunca finge precisão com 1-2 trabalhos. */
export function summarizeCalibrationBySpecialty(
  samples: CalibrationSample[],
  minSample: number = MIN_CALIBRATION_SAMPLE
): SpecialtyCalibration[] {
  const bySpecialty = new Map<string, CalibrationSample[]>()
  for (const s of samples) {
    const list = bySpecialty.get(s.specialty) ?? []
    list.push(s)
    bySpecialty.set(s.specialty, list)
  }

  const result: SpecialtyCalibration[] = []
  for (const [specialty, group] of bySpecialty) {
    if (group.length < minSample) continue
    const summary = summarizeCalibration(group)
    if (summary) result.push({ specialty, ...summary })
  }

  return result.sort((a, b) => b.sampleSize - a.sampleSize)
}
