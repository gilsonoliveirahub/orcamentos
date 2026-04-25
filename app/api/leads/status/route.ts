import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createClient } from '@/lib/supabase-server'
import { emailPedidoDepoimento } from '@/lib/email'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { lead_id, status } = await req.json()

    const userClient = await createClient()
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { error } = await supabaseAdmin
      .from('leads')
      .update({ status })
      .eq('id', lead_id)

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
          }).catch(() => {})
        }
        if (lead.email) {
          emailPedidoDepoimento({
            tipo: 'cliente',
            name: lead.name || 'Cliente',
            email: lead.email,
            outroNome: prof?.name || 'profissional',
          }).catch(() => {})
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
