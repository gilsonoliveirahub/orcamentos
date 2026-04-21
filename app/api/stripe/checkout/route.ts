import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-03-25.dahlia' })

const PLANS = {
  starter: { amount: 1900, name: 'FaçoPorTi Starter', description: 'Até 10 leads/mês, link pessoal, orçamentos automáticos' },
  pro: { amount: 4900, name: 'FaçoPorTi Pro', description: 'Leads ilimitados, follow-up automático, PDF de orçamento, estatísticas avançadas' },
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

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://orcamentos-taupe.vercel.app'
    const selectedPlan = PLANS[plan as keyof typeof PLANS]

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer_email: prof.email,
      metadata: { professional_id: prof.id, plan },
      line_items: [
        {
          price_data: {
            currency: 'eur',
            recurring: { interval: 'month' },
            product_data: {
              name: selectedPlan.name,
              description: selectedPlan.description,
            },
            unit_amount: selectedPlan.amount,
          },
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/upgrade?success=1`,
      cancel_url: `${appUrl}/upgrade?cancelled=1`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
