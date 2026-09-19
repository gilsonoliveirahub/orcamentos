import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createClient } from '@/lib/supabase-server'
import { classifyPriceId, simplifySubscriptionStatus, resolveUnbilledStatus } from '@/lib/stripe-plans'

export const dynamic = 'force-dynamic'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-03-25.dahlia' })

// Só leitura, e só da PRÓPRIA conta. GET sem corpo/parâmetros de propósito
// — este endpoint nunca aceita professional_id, stripe_subscription_id nem
// nenhum outro identificador vindo do browser; o profissional é sempre
// resolvido a partir da sessão autenticada (mesmo padrão de
// app/api/professional/metrics e app/api/leads/status), para um
// profissional nunca conseguir consultar a subscrição de outro. A resposta
// só expõe plan/cycle/status/current_period_end — nunca
// stripe_subscription_id, stripe_customer_id nem o Price ID em si.
export async function GET() {
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const [{ data: prof }, { data: adminRow }] = await Promise.all([
    supabaseAdmin.from('professionals').select('plan, stripe_subscription_id').eq('user_id', user.id).maybeSingle(),
    supabaseAdmin.from('admins').select('id').eq('user_id', user.id).maybeSingle(),
  ])

  if (!prof) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

  const isAdmin = !!adminRow

  // Sem subscrição identificável — nunca inventa ciclo/renovação. Se a
  // conta for de administrador (tabela `admins`) e tiver um tier pago,
  // devolve 'admin_access' em vez de 'no_subscription' (ver
  // resolveUnbilledStatus em lib/stripe-plans.ts) — para nunca aparecer
  // como um erro de cobrança quando é um acesso concedido de propósito.
  function noIdentifiableSubscription() {
    return NextResponse.json({
      plan: prof!.plan,
      cycle: null,
      status: resolveUnbilledStatus(isAdmin, prof!.plan),
      current_period_end: null,
    })
  }

  if (!prof.stripe_subscription_id) return noIdentifiableSubscription()

  try {
    const sub = await stripe.subscriptions.retrieve(prof.stripe_subscription_id)
    const item = sub.items.data[0]
    const classified = classifyPriceId(item?.price?.id)
    return NextResponse.json({
      plan: classified?.plan || prof.plan,
      cycle: classified?.cycle ?? null,
      status: simplifySubscriptionStatus(sub.status),
      current_period_end: item?.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : null,
    })
  } catch {
    // Qualquer falha ao falar com o Stripe (subscrição já não existe,
    // indisponibilidade, rate limit) — nunca um 500 nem bloqueia a página;
    // mesmo tratamento de "sem subscrição identificável" acima.
    return noIdentifiableSubscription()
  }
}
