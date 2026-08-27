export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getAuthenticatedAdmin } from '@/lib/admin-auth'
import { groupLeadsByClient, type LeadForClientView } from '@/lib/admin-clients'

// "Cliente" aqui NÃO é uma tabela própria — é uma vista administrativa
// derivada de `leads`, agrupada por telefone (ver lib/admin-clients.ts).
// Não existe (nem se cria) uma entidade `customers`: o cruzamento real
// leads↔cliente já é sempre feito por telefone em todo o produto.
export async function GET(req: NextRequest) {
  const admin = await getAuthenticatedAdmin()
  if (!admin) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') || '').trim().toLowerCase()

  const { data, error } = await supabaseAdmin
    .from('leads')
    .select('id, phone, name, email, status, source, valor_fechado, created_at, professional_id, professionals(name)')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const leads: LeadForClientView[] = (data || []).map(l => ({
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

  let clients = groupLeadsByClient(leads)

  if (q) {
    clients = clients.filter(c =>
      c.phone.toLowerCase().includes(q) ||
      c.name?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q)
    )
  }

  return NextResponse.json({ clients })
}
