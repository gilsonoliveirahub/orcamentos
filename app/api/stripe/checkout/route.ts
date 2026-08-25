import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-03-25.dahlia' })

const PLANS = {
  starter: { priceId: 'price_1TPAO4LFTn4mze6d70qkDWAj' },
  pro:     { priceId: 'price_1TPAOELFTn4mze6dDaYx6snk' },
}

// Starter < Pro — usado só para decidir a direção do pedido de mudança de
// plano de quem já tem uma subscrição ativa (nunca para novos assinantes).
const PLAN_RANK: Record<string, number> = { starter: 1, pro: 2 }

export async function POST(req: NextRequest) {
  try {
    const { professional_id, plan = 'starter' } = await req.json()

    if (!PLANS[plan as keyof typeof PLANS]) {
      return NextResponse.json({ error: 'Plano inválido' }, { status: 400 })
    }

    const { data: prof } = await supabaseAdmin
      .from('professionals')
      .select('id, name, email, slug, plan, stripe_customer_id, stripe_subscription_id')
      .eq('id', professional_id)
      .single()

    if (!prof) return NextResponse.json({ error: 'Profissional não encontrado' }, { status: 404 })

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://façoporti.com'
    const selectedPlan = PLANS[plan as keyof typeof PLANS]

    // Já tem uma subscrição Stripe ativa — nunca cria uma segunda. Muda a
    // MESMA subscrição, mantendo o mesmo cliente e a mesma data de renovação.
    if (prof.stripe_subscription_id) {
      if (prof.plan === plan) {
        return NextResponse.json({ error: 'Já tens este plano ativo' }, { status: 400 })
      }

      const isUpgrade = (PLAN_RANK[plan] ?? 0) > (PLAN_RANK[prof.plan ?? ''] ?? 0)
      const sub = await stripe.subscriptions.retrieve(prof.stripe_subscription_id)
      const item = sub.items.data[0]
      if (!item) return NextResponse.json({ error: 'Subscrição sem item ativo' }, { status: 500 })

      if (!isUpgrade) {
        // Downgrade: NUNCA muda o preço da subscrição agora — isso cobraria
        // o resto deste ciclo já pago outra vez, ou pior, deixaria a fatura
        // de renovação ser gerada ainda ao preço Pro (a fatura é gerada e
        // cobrada ANTES do webhook invoice.payment_succeeded sequer chegar,
        // por isso mudar o preço só nesse momento chegaria sempre tarde
        // demais). A forma correta de agendar uma mudança de preço para a
        // fronteira exata do ciclo, sem proration nem gap, é uma Subscription
        // Schedule com duas fases: a atual (mantém o preço Pro até ao fim do
        // período já pago) e uma nova a partir daí com o preço Starter — é o
        // próprio Stripe que troca o preço no momento certo, antes de gerar
        // a fatura da fase 2, por isso essa fatura já sai correta (19€).
        const periodEnd = item.current_period_end

        let schedule: Stripe.SubscriptionSchedule
        try {
          schedule = sub.schedule
            ? await stripe.subscriptionSchedules.retrieve(sub.schedule as string)
            : await stripe.subscriptionSchedules.create({ from_subscription: prof.stripe_subscription_id })

          const currentPhase = schedule.phases[0]
          schedule = await stripe.subscriptionSchedules.update(schedule.id, {
            end_behavior: 'release',
            phases: [
              { items: currentPhase.items.map(i => ({ price: i.price as string })), start_date: currentPhase.start_date, end_date: periodEnd },
              { items: [{ price: selectedPlan.priceId }], start_date: periodEnd },
            ],
          })
        } catch (err: any) {
          return NextResponse.json({ error: err.message || 'Falha ao agendar o downgrade' }, { status: 500 })
        }

        // pending_plan é só para a UI ("entra em vigor na próxima renovação")
        // — quem decide QUANDO o preço muda de facto, e cobra corretamente
        // nesse momento, é a Subscription Schedule no Stripe, não esta escrita.
        await supabaseAdmin.from('professionals').update({ pending_plan: plan }).eq('id', professional_id)
        return NextResponse.json({ ok: true, deferred: true })
      }

      // Upgrade: aplicado imediatamente, com proration (Stripe calcula o
      // crédito do período Starter não utilizado e cobra a diferença
      // proporcional do Pro — a quantidade de pedidos usados não entra
      // nesse cálculo monetário). payment_behavior 'error_if_incomplete'
      // torna isto síncrono: se a cobrança da proration falhar, a chamada
      // rejeita e nada é escrito — o profissional mantém Starter e o
      // consumo atual do ciclo, nunca ganha o limite Pro sem pagar.
      let updatedSub: Stripe.Subscription
      try {
        // Havia um downgrade agendado (Subscription Schedule ativa) —
        // liberta-a primeiro: um upgrade cancela qualquer downgrade
        // pendente, e a subscrição não pode ficar presa a uma agenda que
        // ia baixar o preço mais tarde.
        if (sub.schedule) {
          await stripe.subscriptionSchedules.release(sub.schedule as string)
        }
        updatedSub = await stripe.subscriptions.update(prof.stripe_subscription_id, {
          items: [{ id: item.id, price: selectedPlan.priceId }],
          proration_behavior: 'create_prorations',
          payment_behavior: 'error_if_incomplete',
        })
      } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Falha ao cobrar a diferença do upgrade' }, { status: 402 })
      }

      const updatedItem = updatedSub.items.data[0]
      await supabaseAdmin
        .from('professionals')
        .update({
          plan,
          pending_plan: null, // um upgrade cancela qualquer downgrade que estivesse pendente
          current_period_start: updatedItem?.current_period_start ? new Date(updatedItem.current_period_start * 1000).toISOString() : null,
          current_period_end: updatedItem?.current_period_end ? new Date(updatedItem.current_period_end * 1000).toISOString() : null,
        })
        .eq('id', professional_id)

      return NextResponse.json({ ok: true })
    }

    // Sem subscrição ativa — primeira assinatura OU reassinatura depois de
    // um cancelamento. Se já existir stripe_customer_id (reassinatura),
    // reutiliza-o em vez de customer_email — evita criar um segundo
    // Customer Stripe para a mesma pessoa (o Checkout cria sempre um
    // Customer novo a partir de customer_email).
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      ...(prof.stripe_customer_id
        ? { customer: prof.stripe_customer_id }
        : { customer_email: prof.email }),
      metadata: { professional_id: prof.id, plan },
      line_items: [{ price: selectedPlan.priceId, quantity: 1 }],
      success_url: `${appUrl}/upgrade?success=1`,
      cancel_url: `${appUrl}/upgrade?cancelled=1`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
