import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-03-25.dahlia' })

export async function POST(req: NextRequest) {
  try {
    const { professional_id } = await req.json()

    const { data: prof } = await supabaseAdmin
      .from('professionals')
      .select('stripe_customer_id')
      .eq('id', professional_id)
      .single()

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
