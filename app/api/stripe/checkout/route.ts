import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-03-25.dahlia' })

const PLANS = {
  starter: { priceId: 'price_1TOgpYLFTn4mze6d8vw4uqmZ' },
  pro:     { priceId: 'price_1TOgpcLFTn4mze6doVsdAt1O' },
}

export async function POST(req: NextRequest) {
  try {
    const { professional_id, plan = 'starter' } = await req.json()

    if (!PLANS[plan as keyof typeof PLANS]) {
      return NextResponse.json({ error: 'Plano inválido' }, { status: 400 })
    }

    const { data: prof } = await supabaseAdmin
      .from('professionals')
      .select('id, name, email, slug')
      .eq('id', professional_id)
      .single()

    if (!prof) return NextResponse.json({ error: 'Profissional não encontrado' }, { status: 404 })

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://façoporti.com'
    const selectedPlan = PLANS[plan as keyof typeof PLANS]

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer_email: prof.email,
      metadata: { professional_id: prof.id, plan },
      line_items: [{ price: selectedPlan.priceId, quantity: 1 }],
      success_url: `${appUrl}/upgrade?success=1`,
      cancel_url: `${appUrl}/upgrade?cancelled=1`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    return NextResponse.json({ error: err.message, type: err.type, code: err.code, statusCode: err.statusCode }, { status: 500 })
  }
}
