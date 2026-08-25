import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { emailNovoPagamento } from '@/lib/email'

export const dynamic = 'force-dynamic'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-03-25.dahlia' })

// Mesmo price ID usado em /api/stripe/checkout — mantido aqui como
// constante nomeada para nunca voltar a divergir silenciosamente.
const PRO_PRICE_ID = 'price_1TPAOELFTn4mze6dDaYx6snk'

// A partir da API 2025-03-31 do Stripe, current_period_start/end deixaram
// de existir no topo da Subscription e passaram para cada item da
// subscrição (subscription.items.data[N]) — SDK instalado (stripe 21.x)
// já só expõe os campos aí. Usado para alinhar o ciclo de quota do link
// pessoal (10 Starter / 30 Pro) com o período de faturação real, em vez de
// mês calendário.
function subscriptionPeriod(sub: Stripe.Subscription): { current_period_start: string | null; current_period_end: string | null } {
  const item = sub.items.data[0]
  return {
    current_period_start: item?.current_period_start ? new Date(item.current_period_start * 1000).toISOString() : null,
    current_period_end: item?.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : null,
  }
}

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

  // O Stripe garante entrega "at-least-once", nunca "exactly-once" — o
  // mesmo evento pode chegar mais de uma vez (retries, timeouts). Marca-o
  // como processado ANTES de qualquer efeito secundário: se a inserção
  // falhar por violação de unicidade, já foi tratado, devolve 200 sem
  // repetir nada (nunca creditar marketplace_credits duas vezes, por
  // exemplo, nem reaplicar um downgrade pendente duas vezes).
  const { error: dupeError } = await supabaseAdmin
    .from('stripe_webhook_events')
    .insert({ event_id: event.id, event_type: event.type })
  if (dupeError) {
    return NextResponse.json({ ok: true, duplicate: true })
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
        const sub = session.subscription ? await stripe.subscriptions.retrieve(session.subscription as string) : null
        await supabaseAdmin
          .from('professionals')
          .update({
            plan,
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: session.subscription as string,
            ...(sub ? subscriptionPeriod(sub) : {}),
          })
          .eq('id', professional_id)
        if (prof) emailNovoPagamento({
          tipo: 'subscricao', name: prof.name, email: prof.email,
          valor: valorEur, plano: plan.charAt(0).toUpperCase() + plan.slice(1),
        }).catch(() => {})
      }
    }
  }

  // Renovação confirmada — mantém plano ativo. Um downgrade pedido
  // anteriormente é agendado como uma Subscription Schedule no momento do
  // pedido (ver /api/stripe/checkout) — é o Stripe que troca o preço da
  // subscrição exatamente na fronteira do ciclo, ANTES de gerar esta
  // fatura de renovação, por isso a fatura já é gerada e cobrada ao preço
  // novo (nunca ao antigo). Este handler nunca muda a subscrição — só
  // sincroniza o que o Stripe já decidiu, e limpa pending_plan (só usado
  // para a UI) assim que o pagamento confirma que o novo ciclo começou.
  if (event.type === 'invoice.payment_succeeded') {
    const invoice = event.data.object as Stripe.Invoice
    const subId = (invoice as any).subscription as string | null
    if (subId) {
      const sub = await stripe.subscriptions.retrieve(subId)
      const plan = sub.metadata?.plan || (sub.items.data[0]?.price?.id === PRO_PRICE_ID ? 'pro' : 'starter')
      await supabaseAdmin
        .from('professionals')
        .update({ plan, pending_plan: null, ...subscriptionPeriod(sub) })
        .eq('stripe_subscription_id', subId)
    }
  }

  // Pagamento falhado — desativa plano, EXCETO quando a fatura falhada é a
  // proration de um upgrade (subscription_update): nesse caso o
  // profissional fica exatamente como estava (Starter, consumo do ciclo
  // intacto) — nunca perde o acesso só porque não conseguiu pagar a
  // diferença de um upgrade que nunca chegou a ser concedido.
  if (event.type === 'invoice.payment_failed') {
    const invoice = event.data.object as Stripe.Invoice
    const subId = (invoice as any).subscription as string | null
    if (subId && invoice.billing_reason !== 'subscription_update') {
      await supabaseAdmin
        .from('professionals')
        .update({ plan: 'inactive' })
        .eq('stripe_subscription_id', subId)
    }
  }

  // Rede de segurança para qualquer mudança de subscrição que não passe
  // pelas rotas desta aplicação (Stripe Customer Portal, alteração manual
  // no Dashboard do Stripe, confirmação assíncrona de um pagamento) —
  // mantém plan e o período de faturação sempre sincronizados com o que o
  // Stripe realmente tem.
  if (event.type === 'customer.subscription.updated') {
    const sub = event.data.object as Stripe.Subscription
    const plan = sub.metadata?.plan || (sub.items.data[0]?.price?.id === PRO_PRICE_ID ? 'pro' : 'starter')
    await supabaseAdmin
      .from('professionals')
      .update({ plan, ...subscriptionPeriod(sub) })
      .eq('stripe_subscription_id', sub.id)
  }

  // Limpa stripe_subscription_id (nunca stripe_customer_id — o cliente
  // Stripe continua válido e é reutilizado numa reassinatura futura, para
  // nunca criar um segundo Customer para a mesma pessoa). Sem isto,
  // /api/stripe/checkout via prof.stripe_subscription_id ainda preenchido
  // tentava sempre atualizar uma subscrição já cancelada no Stripe (falha
  // sempre), impedindo o profissional de voltar a assinar.
  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription
    await supabaseAdmin
      .from('professionals')
      .update({ plan: 'inactive', stripe_subscription_id: null })
      .eq('stripe_subscription_id', sub.id)
  }

  return NextResponse.json({ ok: true })
}
