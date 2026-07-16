export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { verifyProfessionalOptOutToken } from '@/lib/optout'

// Cancelamento de emails promocionais para PROFISSIONAIS, sem exigir login
// (o link tem de funcionar mesmo sem sessão ativa, como qualquer unsubscribe).
// Separado do cancelamento de clientes (/api/marketing/opt-out) — namespaces
// diferentes no token, tabelas diferentes.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const professionalId = typeof body?.professional_id === 'string' ? body.professional_id : null
  const token = typeof body?.token === 'string' ? body.token : null

  if (!professionalId || !token) {
    return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })
  }

  const secret = process.env.EMAIL_OPTOUT_SECRET
  if (!secret) {
    console.error('[api/opt-out] EMAIL_OPTOUT_SECRET em falta')
    return NextResponse.json({ error: 'Serviço indisponível' }, { status: 500 })
  }

  if (!verifyProfessionalOptOutToken(professionalId, token, secret)) {
    return NextResponse.json({ error: 'Link inválido' }, { status: 403 })
  }

  const { error } = await supabaseAdmin
    .from('professionals')
    .update({ marketing_opt_in: false })
    .eq('id', professionalId)

  if (error) {
    console.error(`[api/opt-out] falha ao desativar opt-in (${professionalId}): ${error.message}`)
    return NextResponse.json({ error: 'Falha ao processar pedido' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
