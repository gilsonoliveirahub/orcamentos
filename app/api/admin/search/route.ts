export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getAuthenticatedAdmin } from '@/lib/admin-auth'
import { groupLeadsByClient, type LeadForClientView } from '@/lib/admin-clients'

const RESULT_LIMIT = 5

// Pesquisa administrativa global — sem arquitetura nova: usa .ilike() direto
// nas tabelas já existentes (dataset pequeno, não justifica um índice de
// pesquisa dedicado). "Cliente" continua a ser derivado de leads por
// telefone (lib/admin-clients.ts), nunca uma tabela própria.
export async function GET(req: NextRequest) {
  const admin = await getAuthenticatedAdmin()
  if (!admin) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

  const q = (new URL(req.url).searchParams.get('q') || '').trim()
  if (q.length < 2) return NextResponse.json({ professionals: [], clients: [], leads: [] })

  // "," tem significado especial em .or() do PostgREST — removido do termo
  // de pesquisa para nunca corromper o filtro (nunca por razões de
  // segurança: esta rota já corre com service role atrás do gate de admin).
  const safeQ = q.replace(/,/g, ' ').trim()
  const pattern = `%${safeQ}%`

  const [{ data: professionals }, { data: leadsForClients }, { data: leadsDirect }] = await Promise.all([
    supabaseAdmin.from('professionals').select('id, name, email, slug')
      .or(`name.ilike.${pattern},email.ilike.${pattern}`)
      .limit(RESULT_LIMIT),
    supabaseAdmin.from('leads').select('id, phone, name, email, status, source, valor_fechado, created_at, professional_id, professionals(name)')
      .or(`name.ilike.${pattern},phone.ilike.${pattern},email.ilike.${pattern}`),
    supabaseAdmin.from('leads').select('id, name, phone, status, created_at')
      .or(`name.ilike.${pattern},phone.ilike.${pattern},email.ilike.${pattern}`)
      .order('created_at', { ascending: false })
      .limit(RESULT_LIMIT),
  ])

  const clientLeads: LeadForClientView[] = (leadsForClients || []).map(l => ({
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
  const clients = groupLeadsByClient(clientLeads).slice(0, RESULT_LIMIT)

  return NextResponse.json({
    professionals: professionals || [],
    clients,
    leads: leadsDirect || [],
  })
}
