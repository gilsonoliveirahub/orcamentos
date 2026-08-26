export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { acquireMarketplaceLead } from '@/lib/marketplace'

async function getAuthenticatedProfessionalId(): Promise<string | null> {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: professional } = await supabaseAdmin
    .from('professionals')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  return professional?.id ?? null
}

const ERROR_MESSAGES: Record<string, string> = {
  plan: 'É preciso um plano pago para adquirir pedidos do marketplace.',
  credits: 'Sem créditos suficientes.',
  taken: 'Este pedido já foi adquirido por outro profissional.',
  not_found: 'Pedido não encontrado.',
  unavailable: 'Estás em pausa e não podes adquirir pedidos. Reativa no teu perfil.',
}

export async function POST(req: NextRequest) {
  const professionalId = await getAuthenticatedProfessionalId()
  if (!professionalId) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const leadId = typeof body?.lead_id === 'string' ? body.lead_id : null
  if (!leadId) return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })

  const result = await acquireMarketplaceLead({ leadId, professionalId })

  if (!result.ok) {
    const status = result.error === 'not_found' ? 404 : result.error === 'taken' ? 409 : result.error === 'unavailable' ? 403 : 402
    return NextResponse.json({ error: ERROR_MESSAGES[result.error], reason: result.error }, { status })
  }

  return NextResponse.json({ ok: true, lead_id: result.leadId })
}
