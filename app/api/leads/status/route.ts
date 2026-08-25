import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createClient } from '@/lib/supabase-server'
import { emailPedidoDepoimento } from '@/lib/email'
import { isLeadAuthorized } from '@/lib/lead-authorization'

export const dynamic = 'force-dynamic'

const ERROR_MESSAGES: Record<string, string> = {
  not_found: 'Pedido não encontrado.',
  locked: 'Este pedido ainda não está desbloqueado.',
}

export async function POST(req: NextRequest) {
  try {
    const { lead_id, status } = await req.json()

    const userClient = await createClient()
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { data: professional } = await supabaseAdmin
      .from('professionals')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!professional) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

    const { data: state } = await supabaseAdmin
      .from('leads')
      .select('id, professional_id, opened_at, source, locked')
      .eq('id', lead_id)
      .maybeSingle()

    // Mensagem genérica em ambos os casos (lead inexistente ou de outro
    // profissional) para não confirmar a um atacante que um lead_id existe.
    if (!state || state.professional_id !== professional.id) {
      return NextResponse.json({ error: ERROR_MESSAGES.not_found, reason: 'not_found' }, { status: 404 })
    }

    if (!isLeadAuthorized(state)) {
      return NextResponse.json({ error: ERROR_MESSAGES.locked, reason: 'locked' }, { status: 403 })
    }

    const { error } = await supabaseAdmin
      .from('leads')
      .update({ status })
      .eq('id', lead_id)
      .eq('professional_id', professional.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    if (status === 'fechado') {
      const { data: lead } = await supabaseAdmin
        .from('leads')
        .select('name, email, professionals(name, email)')
        .eq('id', lead_id)
        .single()

      if (lead) {
        const prof = lead.professionals as any
        if (prof?.email) {
          emailPedidoDepoimento({
            tipo: 'profissional',
            name: prof.name,
            email: prof.email,
            outroNome: lead.name || 'cliente',
            lead_id,
          }).catch(() => {})
        }
        if (lead.email) {
          emailPedidoDepoimento({
            tipo: 'cliente',
            name: lead.name || 'Cliente',
            email: lead.email,
            outroNome: prof?.name || 'profissional',
            lead_id,
          }).catch(() => {})
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
