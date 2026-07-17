export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { listMarketplaceOpportunities } from '@/lib/marketplace'

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

// Resumo apenas: especialidade, zona, data, distância aproximada — nunca
// nome/telefone/email/notas do cliente. A autorização e o filtro por
// especialidade/distância são sempre feitos aqui, no servidor.
export async function GET() {
  const professionalId = await getAuthenticatedProfessionalId()
  if (!professionalId) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

  try {
    const opportunities = await listMarketplaceOpportunities(professionalId)
    return NextResponse.json({ opportunities })
  } catch (err) {
    console.error('[api/marketplace/opportunities] erro:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Falha ao carregar oportunidades' }, { status: 500 })
  }
}
