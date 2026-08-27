export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getAuthenticatedAdmin } from '@/lib/admin-auth'
import { groupLeadsByClient, type LeadForClientView } from '@/lib/admin-clients'
import { getAdminLeadAccessState } from '@/lib/admin-lead-access-state'

// Ficha do "cliente" — sempre resolvida por telefone (nunca por um id de
// cliente próprio, porque essa entidade não existe; ver lib/admin-clients.ts).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ phone: string }> }) {
  const admin = await getAuthenticatedAdmin()
  if (!admin) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

  const { phone: rawPhone } = await params
  const phone = decodeURIComponent(rawPhone)

  const { data, error } = await supabaseAdmin
    .from('leads')
    .select('id, phone, name, email, status, source, specialty, zone_requested, valor_fechado, created_at, opened_at, professional_id, professionals(id, name, specialty, zone, slug)')
    .eq('phone', phone)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data || data.length === 0) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  const leadsForSummary: LeadForClientView[] = data.map(l => ({
    id: l.id as string,
    phone: l.phone as string | null,
    name: l.name as string | null,
    email: l.email as string | null,
    status: l.status as string | null,
    source: l.source as string | null,
    valor_fechado: l.valor_fechado as number | null,
    created_at: l.created_at as string,
    professional_id: l.professional_id as string | null,
    professional_name: (l.professionals as unknown as { name: string } | null)?.name ?? null,
  }))
  const [summary] = groupLeadsByClient(leadsForSummary)

  const { data: clientAccount } = await supabaseAdmin.from('clients').select('id, name, email').eq('phone', phone).maybeSingle()

  return NextResponse.json({
    client: summary,
    account: clientAccount || null, // conta de login associada, se existir
    leads: data.map(l => ({
      ...l,
      access_state: getAdminLeadAccessState(l as unknown as { source: string | null; opened_at: string | null; professional_id: string | null }),
    })),
  })
}
