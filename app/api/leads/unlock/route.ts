import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createClient } from '@/lib/supabase-server'
import { emailLeadDesbloqueado } from '@/lib/email'

export const dynamic = 'force-dynamic'

const ERROR_MESSAGES: Record<string, string> = {
  not_found: 'Pedido não encontrado.',
  credits: 'Sem créditos.',
}

export async function POST(req: NextRequest) {
  try {
    const { lead_id } = await req.json()

    const userClient = await createClient()
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { data: prof } = await supabaseAdmin
      .from('professionals')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (!prof) return NextResponse.json({ error: 'Profissional não encontrado' }, { status: 404 })

    // Desconto do crédito e desbloqueio do lead numa única transação SQL
    // (unlock_marketplace_lead_by_credit) — nunca duas operações
    // independentes: dois cliques simultâneos nunca descontam 2 créditos.
    const { data: result } = await supabaseAdmin.rpc('unlock_marketplace_lead_by_credit', {
      p_lead_id: lead_id,
      p_professional_id: prof.id,
    })

    if (!result?.ok) {
      const reason = result?.error ?? 'not_found'
      const status = reason === 'credits' ? 402 : 404
      return NextResponse.json({ error: ERROR_MESSAGES[reason] ?? 'Falha ao desbloquear.', reason }, { status })
    }

    // Email de confirmação — o lead já está desbloqueado (autorizado),
    // seguro ler os dados de contacto aqui.
    const { data: lead } = await supabaseAdmin
      .from('leads')
      .select('id, name, phone, email')
      .eq('id', lead_id)
      .single()

    if (lead) {
      const { data: profFull } = await supabaseAdmin
        .from('professionals')
        .select('name, email')
        .eq('id', prof.id)
        .single()
      if (profFull) {
        emailLeadDesbloqueado({
          profName: profFull.name,
          profEmail: profFull.email,
          leadName: lead.name || '—',
          leadPhone: lead.phone || '—',
          leadEmail: lead.email,
          leadId: lead.id,
        }).catch(() => {})
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
