import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { emailNovoPagamento } from '@/lib/email'

export const dynamic = 'force-dynamic'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-03-25.dahlia' })

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  let event: Stripe.Event

  try {
    if (webhookSecret && sig) {
      event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
    } else {
      event = JSON.parse(body)
    }
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook error: ${err.message}` }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const professional_id = session.metadata?.professional_id

    if (professional_id) {
      const { data: prof } = await supabaseAdmin
        .from('professionals')
        .select('name, email, marketplace_credits')
        .eq('id', professional_id)
        .single()

      if (session.metadata?.type === 'credits') {
        const credits = parseInt(session.metadata.credits || '0')
        const valorEur = session.metadata.amount_eur || `${credits} créditos`
        await supabaseAdmin
          .from('professionals')
          .update({ marketplace_credits: (prof?.marketplace_credits || 0) + credits })
          .eq('id', professional_id)
        if (prof) emailNovoPagamento({
          tipo: 'creditos', name: prof.name, email: prof.email,
          valor: valorEur,
        }).catch(() => {})
      } else {
        const plan = session.metadata?.plan || 'starter'
        const valorEur = plan === 'pro' ? '€39/mês' : '€19/mês'
        await supabaseAdmin
          .from('professionals')
          .update({
            plan,
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: session.subscription as string,
          })
          .eq('id', professional_id)
        if (prof) emailNovoPagamento({
          tipo: 'subscricao', name: prof.name, email: prof.email,
          valor: valorEur, plano: plan.charAt(0).toUpperCase() + plan.slice(1),
        }).catch(() => {})
      }
    }
  }

  // Renovação mensal confirmada — mantém plano ativo
  if (event.type === 'invoice.payment_succeeded') {
    const invoice = event.data.object as Stripe.Invoice
    const subId = (invoice as any).subscription as string | null
    if (subId) {
      const sub = await stripe.subscriptions.retrieve(subId)
      const plan = sub.metadata?.plan || (sub.items.data[0]?.price?.id === 'price_1TOgpcLFTn4mze6doVsdAt1O' ? 'pro' : 'starter')
      await supabaseAdmin
        .from('professionals')
        .update({ plan })
        .eq('stripe_subscription_id', subId)
    }
  }

  // Pagamento falhado — desativa plano
  if (event.type === 'invoice.payment_failed') {
    const invoice = event.data.object as Stripe.Invoice
    const subId = (invoice as any).subscription as string | null
    if (subId) {
      await supabaseAdmin
        .from('professionals')
        .update({ plan: 'inactive' })
        .eq('stripe_subscription_id', subId)
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription
    await supabaseAdmin
      .from('professionals')
      .update({ plan: 'inactive' })
      .eq('stripe_subscription_id', sub.id)
  }

  return NextResponse.json({ ok: true })
}
