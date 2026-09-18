import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getCreditPack, creditPackAmountCents } from '@/lib/marketplace-credits'

export const dynamic = 'force-dynamic'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-03-25.dahlia' })

export async function POST(req: NextRequest) {
  try {
    const { professional_id, pack } = await req.json()

    // P2 (2026-09-18): pacotes e preços vêm de lib/marketplace-credits.ts
    // (fonte única, com os 4 pacotes ditados por Gilson, todos já com IVA
    // incluído) — nunca duplicados aqui. `price_data` inline (sem Price ID
    // fixo do Stripe) porque são pagamentos únicos, não subscrições — o
    // mesmo padrão já usado antes dos 20€/45€/75€ antigos, só os valores
    // mudam.
    const selectedPack = getCreditPack(pack)
    if (!selectedPack) return NextResponse.json({ error: 'Pack inválido' }, { status: 400 })

    const { data: prof } = await supabaseAdmin
      .from('professionals')
      .select('id, email')
      .eq('id', professional_id)
      .single()

    if (!prof) return NextResponse.json({ error: 'Profissional não encontrado' }, { status: 404 })

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://façoporti.com'

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: prof.email,
      metadata: { professional_id: prof.id, credits: String(selectedPack.credits), type: 'credits' },
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: `${selectedPack.credits} crédito${selectedPack.credits > 1 ? 's' : ''} FaçoPorTi (IVA incluído)`,
            },
            unit_amount: creditPackAmountCents(selectedPack),
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
