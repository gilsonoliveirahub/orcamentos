import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolvePriceId, isPlanTier, isBillingCycle, PLAN_RANK } from '@/lib/stripe-plans'

export const dynamic = 'force-dynamic'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-03-25.dahlia' })

export async function POST(req: NextRequest) {
  try {
    const { professional_id, plan = 'starter', cycle = 'monthly' } = await req.json()

    // Lista fechada (lib/stripe-plans.ts) — o pedido só manda plano e ciclo,
    // nunca um Price ID nem um valor. Um plano/ciclo fora de
    // 'starter'/'pro'/'monthly'/'annual' é recusado aqui, antes de tocar em
    // qualquer coisa.
    if (!isPlanTier(plan)) {
      return NextResponse.json({ error: 'Plano inválido' }, { status: 400 })
    }
    if (!isBillingCycle(cycle)) {
      return NextResponse.json({ error: 'Ciclo de faturação inválido' }, { status: 400 })
    }

    const priceId = resolvePriceId(plan, cycle)
    if (!priceId) {
      // Só acontece para o ciclo anual sem a variável de ambiente
      // configurada (STRIPE_PRICE_STARTER_ANNUAL / STRIPE_PRICE_PRO_ANNUAL)
      // — nunca cai silenciosamente no preço mensal.
      return NextResponse.json({
        error: 'Este plano/ciclo ainda não está disponível — falta configurar o Price ID correspondente no Stripe.',
      }, { status: 501 })
    }

    const { data: prof } = await supabaseAdmin
      .from('professionals')
      .select('id, name, email, slug, plan, stripe_customer_id, stripe_subscription_id')
      .eq('id', professional_id)
      .single()

    if (!prof) return NextResponse.json({ error: 'Profissional não encontrado' }, { status: 404 })

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://façoporti.com'

    // Já tem uma subscrição Stripe ativa — nunca cria uma segunda. Muda a
    // MESMA subscrição, mantendo o mesmo cliente e a mesma data de renovação.
    if (prof.stripe_subscription_id) {
      const sub = await stripe.subscriptions.retrieve(prof.stripe_subscription_id)
      const item = sub.items.data[0]
      if (!item) return NextResponse.json({ error: 'Subscrição sem item ativo' }, { status: 500 })

      // Compara o Price ID REAL da subscrição (não só o plano/tier
      // guardado na BD, que nunca distinguiu ciclo) — assim um pedido para
      // trocar só o ciclo (ex: Starter mensal -> Starter anual) nunca é
      // bloqueado como "já tens este plano", e um pedido idêntico ao que já
      // está ativo (mesmo plano E mesmo ciclo) é sempre recusado.
      if (item.price?.id === priceId) {
        return NextResponse.json({ error: 'Já tens este plano e ciclo ativos' }, { status: 400 })
      }

      // Direção (upgrade/downgrade) decidida só pelo tier (Starter/Pro),
      // nunca pelo ciclo — trocar só o ciclo no mesmo tier segue o mesmo
      // caminho "downgrade" (agendado para a próxima renovação, nunca
      // reproration imediata) por ser o mais seguro sem inventar uma
      // terceira via só para troca de ciclo.
      const isUpgrade = (PLAN_RANK[plan] ?? 0) > (PLAN_RANK[prof.plan as keyof typeof PLAN_RANK] ?? 0)

      if (!isUpgrade) {
        // Downgrade (ou troca de ciclo no mesmo tier): NUNCA muda o preço
        // da subscrição agora — isso cobraria o resto deste ciclo já pago
        // outra vez, ou pior, deixaria a fatura de renovação ser gerada
        // ainda ao preço antigo (a fatura é gerada e cobrada ANTES do
        // webhook invoice.payment_succeeded sequer chegar, por isso mudar o
        // preço só nesse momento chegaria sempre tarde demais). A forma
        // correta de agendar uma mudança de preço para a fronteira exata do
        // ciclo, sem proration nem gap, é uma Subscription Schedule com duas
        // fases: a atual (mantém o preço até ao fim do período já pago) e
        // uma nova a partir daí com o preço/ciclo pedido — é o próprio
        // Stripe que troca o preço no momento certo, antes de gerar a
        // fatura da fase 2, por isso essa fatura já sai correta.
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
              { items: [{ price: priceId }], start_date: periodEnd },
            ],
          })
        } catch (err: any) {
          return NextResponse.json({ error: err.message || 'Falha ao agendar a alteração' }, { status: 500 })
        }

        // pending_plan é só para a UI ("entra em vigor na próxima renovação")
        // — quem decide QUANDO o preço muda de facto, e cobra corretamente
        // nesse momento, é a Subscription Schedule no Stripe, não esta escrita.
        await supabaseAdmin.from('professionals').update({ pending_plan: plan }).eq('id', professional_id)
        return NextResponse.json({ ok: true, deferred: true })
      }

      // Upgrade de tier: aplicado imediatamente, com proration (Stripe
      // calcula o crédito do período não utilizado e cobra a diferença
      // proporcional — a quantidade de pedidos usados não entra nesse
      // cálculo monetário). payment_behavior 'error_if_incomplete' torna
      // isto síncrono: se a cobrança da proration falhar, a chamada rejeita
      // e nada é escrito — o profissional mantém o plano/ciclo atual, nunca
      // ganha o novo tier sem pagar.
      let updatedSub: Stripe.Subscription
      try {
        // Havia um downgrade/troca de ciclo agendada (Subscription Schedule
        // ativa) — liberta-a primeiro: um upgrade cancela qualquer mudança
        // pendente, e a subscrição não pode ficar presa a uma agenda futura.
        if (sub.schedule) {
          await stripe.subscriptionSchedules.release(sub.schedule as string)
        }
        updatedSub = await stripe.subscriptions.update(prof.stripe_subscription_id, {
          items: [{ id: item.id, price: priceId }],
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
    //
    // automatic_tax: cálculo automático de IVA pelo Stripe Tax — os 4 Price
    // IDs (mensal fixo + anual via env var) são tax-exclusive, o Stripe
    // acrescenta o IVA português por cima do valor base ao mostrar o
    // checkout. Depende de o Stripe Tax estar configurado na conta
    // (registo/endereço fiscal) — não verificável a partir daqui sem uma
    // chamada real ao Stripe, que este ambiente local não consegue fazer
    // (STRIPE_SECRET_KEY vazia); confirmar num checkout real em produção.
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      ...(prof.stripe_customer_id
        ? { customer: prof.stripe_customer_id }
        : { customer_email: prof.email }),
      metadata: { professional_id: prof.id, plan, cycle },
      line_items: [{ price: priceId, quantity: 1 }],
      automatic_tax: { enabled: true },
      success_url: `${appUrl}/upgrade?success=1`,
      cancel_url: `${appUrl}/upgrade?cancelled=1`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
