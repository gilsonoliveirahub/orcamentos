import { NextRequest, NextResponse } from 'next/server'
import { notifyLeadCreated } from '@/lib/notify-lead'

export const dynamic = 'force-dynamic'

// Wrapper HTTP fino sobre lib/notify-lead.ts (ver esse ficheiro para a
// lógica completa e o porquê da extração — P0, 2026-09-18). Mantido como
// rota própria porque continua a ser chamado por lib/marketplace.ts (depois
// de uma aquisição no marketplace) e pode ser útil para reenvio manual no
// futuro. O canal do link pessoal (/p/[slug]) deixou de chamar esta rota via
// fetch — chama notifyLeadCreated() diretamente, em processo, a partir de
// app/api/leads/public/route.ts.
export async function POST(req: NextRequest) {
  try {
    const { lead_id } = await req.json()
    const result = await notifyLeadCreated(lead_id)
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
