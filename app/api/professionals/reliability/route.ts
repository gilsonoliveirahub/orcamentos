export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { buildReliabilityScores } from '@/lib/professional-reliability-scores'

// Endpoint público (usado por /profissionais, página pública) — devolve só
// agregados por profissional (fiabilidade, capacidade, conversão e
// velocidade de resposta). Cálculo em lib/professional-reliability-scores.ts,
// partilhado com páginas server-side que precisem do mesmo ranking
// (ex: /profissionais/[especialidade]) sem um round-trip HTTP a si própria.
export async function GET() {
  try {
    const scores = await buildReliabilityScores()
    return NextResponse.json({ scores })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
