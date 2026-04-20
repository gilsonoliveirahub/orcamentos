import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-01-27.acacia' })

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
      // Compra de créditos
      if (session.metadata?.type === 'credits') {
        const credits = parseInt(session.metadata.credits || '0')
        const { data: prof } = await supabaseAdmin
          .from('professionals')
          .select('marketplace_credits')
          .eq('id', professional_id)
          .single()
        await supabaseAdmin
          .from('professionals')
          .update({ marketplace_credits: (prof?.marketplace_credits || 0) + credits })
          .eq('id', professional_id)
      } else {
        // Subscrição
        const plan = session.metadata?.plan || 'starter'
        await supabaseAdmin
          .from('professionals')
          .update({
            plan,
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: session.subscription as string,
          })
          .eq('id', professional_id)
      }
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
