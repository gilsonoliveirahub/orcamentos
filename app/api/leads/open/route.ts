export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { openPersonalLead } from '@/lib/personal-link-limits'
import { isLeadAuthorized } from '@/lib/lead-authorization'

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
  plan: 'É preciso um plano pago para abrir pedidos do link pessoal.',
  quota: 'Limite de pedidos abertos neste ciclo atingido. Os pedidos já abertos continuam acessíveis.',
  not_found: 'Pedido não encontrado.',
  locked: 'Este pedido ainda não está desbloqueado.',
}

// Única autoridade server-side para "abrir" um lead e devolver os seus
// dados completos. Nunca devolve nome/telefone/email/notas antes de
// confirmar autorização aqui — o cliente Supabase (RLS) já nem consegue
// pedir essas colunas diretamente (ver REVOKE em
// supabase/migration_marketplace_v3_atomic.sql), por isso este é o único
// caminho pelo qual esses dados chegam ao browser.
export async function POST(req: NextRequest) {
  const professionalId = await getAuthenticatedProfessionalId()
  if (!professionalId) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const leadId = typeof body?.lead_id === 'string' ? body.lead_id : null
  if (!leadId) return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })

  const { data: state } = await supabaseAdmin
    .from('leads')
    .select('id, professional_id, source, opened_at, locked')
    .eq('id', leadId)
    .maybeSingle()

  if (!state || state.professional_id !== professionalId) {
    return NextResponse.json({ error: ERROR_MESSAGES.not_found, reason: 'not_found' }, { status: 404 })
  }

  // Leads do marketplace já chegam aqui com a decisão tomada (locked=false
  // só depois de uma aquisição válida) — só o link pessoal ainda pode
  // precisar de consumir quota nesta chamada.
  if (state.source !== 'marketplace' && !state.opened_at) {
    const result = await openPersonalLead({ leadId, professionalId })
    if (!result.ok) {
      const status = result.error === 'not_found' ? 404 : 403
      return NextResponse.json({ error: ERROR_MESSAGES[result.error], reason: result.error }, { status })
    }
  }

  const { data: fresh } = await supabaseAdmin
    .from('leads')
    .select('opened_at, source, locked')
    .eq('id', leadId)
    .single()

  if (!fresh || !isLeadAuthorized(fresh)) {
    return NextResponse.json({ error: ERROR_MESSAGES.locked, reason: 'locked' }, { status: 403 })
  }

  const [{ data: lead }, { data: quote }] = await Promise.all([
    supabaseAdmin.from('leads').select('*, professionals(*)').eq('id', leadId).single(),
    supabaseAdmin.from('quotes').select('*').eq('lead_id', leadId).maybeSingle(),
  ])

  return NextResponse.json({ ok: true, lead, quote: quote ?? null })
}
