import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-03-25.dahlia' })

// Sem corpo/parâmetros de propósito (2026-10-17, correção de segurança) —
// esta rota aceitava antes um professional_id vindo do corpo do pedido,
// sem confirmar que pertencia a quem estava autenticado. Isso permitia a
// qualquer utilizador autenticado abrir o portal de faturação Stripe de
// OUTRO profissional só por adivinhar/enumerar o seu id (IDOR). Mesmo
// padrão de app/api/stripe/subscription-status e app/api/leads/status: o
// profissional é sempre resolvido a partir da sessão autenticada, nunca de
// um identificador enviado pelo browser.
export async function POST() {
  try {
    const userClient = await createClient()
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { data: prof } = await supabaseAdmin
      .from('professionals')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!prof?.stripe_customer_id) {
      return NextResponse.json({ error: 'Sem subscrição ativa' }, { status: 400 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://façoporti.com'

    const session = await stripe.billingPortal.sessions.create({
      customer: prof.stripe_customer_id,
      return_url: `${appUrl}/upgrade`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
