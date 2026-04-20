import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-01-27.acacia' })

const PACKS = {
  pack10: { credits: 10, amount: 2000, label: '10 leads do site — €20' },
  pack25: { credits: 25, amount: 4500, label: '25 leads do site — €45' },
  pack50: { credits: 50, amount: 7500, label: '50 leads do site — €75' },
}

export async function POST(req: NextRequest) {
  try {
    const { professional_id, pack } = await req.json()

    const selectedPack = PACKS[pack as keyof typeof PACKS]
    if (!selectedPack) return NextResponse.json({ error: 'Pack inválido' }, { status: 400 })

    const { data: prof } = await supabaseAdmin
      .from('professionals')
      .select('id, email')
      .eq('id', professional_id)
      .single()

    if (!prof) return NextResponse.json({ error: 'Profissional não encontrado' }, { status: 404 })

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://orcamentos-taupe.vercel.app'

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: prof.email,
      metadata: { professional_id: prof.id, credits: String(selectedPack.credits), type: 'credits' },
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: { name: selectedPack.label },
            unit_amount: selectedPack.amount,
          },
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/dashboard?credits=ok`,
      cancel_url: `${appUrl}/dashboard`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
