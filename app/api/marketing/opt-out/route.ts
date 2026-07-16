export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { verifyClientOptOutToken } from '@/lib/optout'

// Cancelamento de emails promocionais para CLIENTES (quem pede orçamentos),
// sem exigir login. O registo em marketing_consents é por email, não por
// lead — bloqueia envios futuros para esse endereço mesmo que existam vários
// pedidos de orçamento associados ao mesmo email.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : null
  const token = typeof body?.token === 'string' ? body.token : null

  if (!email || !token) {
    return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })
  }

  const secret = process.env.EMAIL_OPTOUT_SECRET
  if (!secret) {
    console.error('[api/marketing/opt-out] EMAIL_OPTOUT_SECRET em falta')
    return NextResponse.json({ error: 'Serviço indisponível' }, { status: 500 })
  }

  if (!verifyClientOptOutToken(email, token, secret)) {
    return NextResponse.json({ error: 'Link inválido' }, { status: 403 })
  }

  const { error } = await supabaseAdmin
    .from('marketing_consents')
    .upsert(
      { email, opted_in: false, opted_out_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { onConflict: 'email' }
    )

  if (error) {
    console.error(`[api/marketing/opt-out] falha ao registar cancelamento (${email}): ${error.message}`)
    return NextResponse.json({ error: 'Falha ao processar pedido' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
