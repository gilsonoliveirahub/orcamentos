import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getCreditPack, creditPackAmountCents } from '@/lib/marketplace-credits'

export const dynamic = 'force-dynamic'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-03-25.dahlia' })

export async function POST(req: NextRequest) {
  try {
    const { professional_id, pack } = await req.json()

    // Preços 2026-10-17: pacotes vêm de lib/marketplace-credits.ts (fonte
    // única). `price_data` inline (sem Price ID fixo do Stripe) porque são
    // pagamentos únicos, não subscrições — mesmo padrão de sempre, só os
    // valores mudam. `unit_amount` é agora o valor SEM IVA
    // (creditPackAmountCents usa baseEur) — automatic_tax acrescenta o
    // IVA real (23%) no checkout, uma única vez, nunca embutido no número.
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
      // MB WAY e Multibanco só existem para pagamentos únicos (nunca
      // subscrições — Stripe não permite) e cobrem toda a gama de valores
      // dos pacotes de créditos (23,37€–876,38€, já com IVA): MB WAY vai
      // até 5.000€, Multibanco até 99.999€ (docs.stripe.com/payments/mb-way
      // e /payments/multibanco) — nenhum pack fica de fora.
      payment_method_types: ['card', 'multibanco', 'mb_way'],
      metadata: { professional_id: prof.id, credits: String(selectedPack.credits), type: 'credits' },
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: `${selectedPack.credits} crédito${selectedPack.credits > 1 ? 's' : ''} FaçoPorTi`,
            },
            unit_amount: creditPackAmountCents(selectedPack),
          },
          quantity: 1,
        },
      ],
      // Preço de cada pack (lib/marketplace-credits.ts, baseEur) já vem
      // SEM IVA — automatic_tax acrescenta o valor real (23%) no checkout,
      // uma única vez, nunca duplicado aqui.
      automatic_tax: { enabled: true },
      success_url: `${appUrl}/dashboard?credits=ok`,
      cancel_url: `${appUrl}/dashboard`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
