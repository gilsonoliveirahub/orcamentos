import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { emailNovoPagamento } from '@/lib/email'
import { classifyPriceId } from '@/lib/stripe-plans'
import { getSubscriptionPeriod } from '@/lib/stripe-subscription-period'
import { flagSubscriptionConflict } from '@/lib/subscription-conflicts'
import { releaseCheckoutLock } from '@/lib/checkout-lock'

export const dynamic = 'force-dynamic'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-03-25.dahlia' })

function customerIdOf(customer: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined): string | null {
  if (!customer) return null
  return typeof customer === 'string' ? customer : customer.id
}

type ProfessionalByCustomer =
  | { status: 'found'; id: string; stripe_subscription_id: string | null }
  | { status: 'not_found' }
  | { status: 'ambiguous'; ids: string[] }

/**
 * Requisito 6 (revisão adversarial, 2026-09-19): identifica o profissional
 * pelo stripe_customer_id, mas NUNCA escolhe um arbitrariamente se mais do
 * que uma linha corresponder (bug de escrita, corrida, ou intervenção
 * manual — nunca devia acontecer; há um índice único parcial preparado na
 * migração especificamente para prevenir isto ao nível da BD). Usa
 * `.select()` simples (devolve uma lista) em vez de `.maybeSingle()` de
 * propósito — `.maybeSingle()` do PostgREST devolve um ERRO quando há mais
 * de uma linha, que sem tratamento explícito passaria por `data: null`
 * silenciosamente, escondendo exatamente o caso ambíguo que é preciso
 * detetar.
 */
async function findProfessionalByCustomer(customerId: string | null): Promise<ProfessionalByCustomer> {
  if (!customerId) return { status: 'not_found' }
  const { data, error } = await supabaseAdmin
    .from('professionals')
    .select('id, stripe_subscription_id')
    .eq('stripe_customer_id', customerId)
  if (error || !data || data.length === 0) return { status: 'not_found' }
  if (data.length > 1) return { status: 'ambiguous', ids: data.map(r => r.id) }
  return { status: 'found', id: data[0].id, stripe_subscription_id: data[0].stripe_subscription_id }
}

// Ambíguo (2+ profissionais com o mesmo stripe_customer_id) não tem um
// professional_id único para anexar a subscription_conflicts (essa tabela
// exige exatamente um, por FK) — nunca escolhe um dos dois para não
// escrever informação errada. Fica visível nos logs do servidor (Vercel),
// para intervenção manual — é exatamente o caso que o índice único parcial
// em professionals.stripe_customer_id (migração) previne para o futuro.
function logAmbiguousCustomer(context: string, customerId: string | null, professionalIds: string[], eventId: string) {
  console.error(`[webhook/stripe] ${context}: stripe_customer_id=${customerId} associado a ${professionalIds.length} profissionais (${professionalIds.join(', ')}) — evento ${eventId} ignorado, nunca escolhido arbitrariamente.`)
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
  // mesmo evento pode chegar mais de uma vez. Marca-o como processado
  // ANTES de qualquer efeito secundário.
  const { error: dupeError } = await supabaseAdmin
    .from('stripe_webhook_events')
    .insert({ event_id: event.id, event_type: event.type })
  if (dupeError) {
    return NextResponse.json({ ok: true, duplicate: true })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const professional_id = session.metadata?.professional_id
    const checkoutIdempotencyKey = session.metadata?.checkout_idempotency_key

    if (professional_id) {
      const { data: prof } = await supabaseAdmin
        .from('professionals')
        .select('name, email, marketplace_credits, stripe_subscription_id')
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
        const newSubId = session.subscription as string | undefined
        const sub = newSubId ? await stripe.subscriptions.retrieve(newSubId) : null

        // Proteção contra dupla subscrição: se a BD já tem um
        // stripe_subscription_id DIFERENTE deste, nunca sobrescreve — os
        // webhooks podem chegar fora de ordem. Só regista o conflito.
        if (newSubId && prof?.stripe_subscription_id && prof.stripe_subscription_id !== newSubId) {
          await flagSubscriptionConflict({
            professionalId: professional_id,
            existingSubscriptionId: prof.stripe_subscription_id,
            newSubscriptionId: newSubId,
            source: 'checkout.session.completed',
            eventId: event.id,
          })
        } else {
          const classified = sub ? classifyPriceId(sub.items.data[0]?.price?.id) : null
          const plan = classified?.plan || session.metadata?.plan || 'starter'
          const cycle = classified?.cycle || session.metadata?.cycle || 'monthly'
          const valorEur = cycle === 'annual'
            ? (plan === 'pro' ? '€397,80/ano + IVA' : '€193,80/ano + IVA')
            : (plan === 'pro' ? '€39/mês + IVA' : '€19/mês + IVA')
          await supabaseAdmin
            .from('professionals')
            .update({
              plan,
              stripe_customer_id: session.customer as string,
              stripe_subscription_id: session.subscription as string,
              ...(sub ? getSubscriptionPeriod(sub) : {}),
            })
            .eq('id', professional_id)
          if (prof) emailNovoPagamento({
            tipo: 'subscricao', name: prof.name, email: prof.email,
            valor: valorEur, plano: plan.charAt(0).toUpperCase() + plan.slice(1),
          }).catch(() => {})
        }

        // O desfecho já é conhecido — a reserva de checkout já não protege
        // nada, liberta-a sempre. Condicionado pelo idempotency_key que a
        // criou (requisito 2) — nunca liberta uma reserva mais recente que
        // possa já ter substituído esta (ex: sessão expirou e outra
        // operação começou entretanto, antes deste webhook chegar).
        if (checkoutIdempotencyKey) await releaseCheckoutLock(professional_id, checkoutIdempotencyKey)
      }
    }
  }

  // Sessão de checkout abriu mas nunca foi concluída — liberta a reserva
  // para o profissional poder tentar de novo, condicionado pelo mesmo
  // idempotency_key que a criou (nunca a professional_id sozinho).
  if (event.type === 'checkout.session.expired') {
    const session = event.data.object as Stripe.Checkout.Session
    const professional_id = session.metadata?.professional_id
    const checkoutIdempotencyKey = session.metadata?.checkout_idempotency_key
    if (professional_id && checkoutIdempotencyKey) await releaseCheckoutLock(professional_id, checkoutIdempotencyKey)
  }

  // Renovação confirmada — mantém plano ativo. Este handler nunca muda a
  // subscrição — só sincroniza o que o Stripe já decidiu.
  if (event.type === 'invoice.payment_succeeded') {
    const invoice = event.data.object as Stripe.Invoice
    const subId = (invoice as any).subscription as string | null
    if (subId) {
      const sub = await stripe.subscriptions.retrieve(subId)
      const profResult = await findProfessionalByCustomer(customerIdOf(sub.customer))

      if (profResult.status === 'ambiguous') {
        logAmbiguousCustomer('invoice.payment_succeeded', customerIdOf(sub.customer), profResult.ids, event.id)
      } else if (profResult.status === 'found') {
        // Segundo sinal de identidade, quando presente (subscription_data.metadata
        // definido em app/api/stripe/checkout) — nunca contradiz o
        // stripe_customer_id sem ser assinalado.
        const metadataProfessionalId = sub.metadata?.professional_id
        if (metadataProfessionalId && metadataProfessionalId !== profResult.id) {
          await flagSubscriptionConflict({
            professionalId: profResult.id,
            existingSubscriptionId: profResult.stripe_subscription_id,
            newSubscriptionId: subId,
            source: 'invoice.payment_succeeded',
            eventId: event.id,
          })
        } else if (profResult.stripe_subscription_id && profResult.stripe_subscription_id !== subId) {
          // Webhooks podem chegar fora de ordem — nunca sobrescreve nem
          // assume que este é "mais recente e por isso correto".
          await flagSubscriptionConflict({
            professionalId: profResult.id,
            existingSubscriptionId: profResult.stripe_subscription_id,
            newSubscriptionId: subId,
            source: 'invoice.payment_succeeded',
            eventId: event.id,
          })
        } else {
          const plan = classifyPriceId(sub.items.data[0]?.price?.id)?.plan || sub.metadata?.plan || 'starter'
          await supabaseAdmin
            .from('professionals')
            .update({ plan, pending_plan: null, ...getSubscriptionPeriod(sub) })
            .eq('id', profResult.id)
        }
      }
    }
  }

  // Pagamento falhado — desativa plano, EXCETO quando a fatura falhada é a
  // proration de um upgrade (subscription_update).
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
  // no Dashboard do Stripe, confirmação assíncrona de um pagamento).
  if (event.type === 'customer.subscription.updated') {
    const sub = event.data.object as Stripe.Subscription
    const profResult = await findProfessionalByCustomer(customerIdOf(sub.customer))

    if (profResult.status === 'ambiguous') {
      logAmbiguousCustomer('customer.subscription.updated', customerIdOf(sub.customer), profResult.ids, event.id)
    } else if (profResult.status === 'found') {
      const metadataProfessionalId = sub.metadata?.professional_id
      if (metadataProfessionalId && metadataProfessionalId !== profResult.id) {
        await flagSubscriptionConflict({
          professionalId: profResult.id,
          existingSubscriptionId: profResult.stripe_subscription_id,
          newSubscriptionId: sub.id,
          source: 'customer.subscription.updated',
          eventId: event.id,
        })
      } else if (profResult.stripe_subscription_id && profResult.stripe_subscription_id !== sub.id) {
        await flagSubscriptionConflict({
          professionalId: profResult.id,
          existingSubscriptionId: profResult.stripe_subscription_id,
          newSubscriptionId: sub.id,
          source: 'customer.subscription.updated',
          eventId: event.id,
        })
      } else {
        const plan = classifyPriceId(sub.items.data[0]?.price?.id)?.plan || sub.metadata?.plan || 'starter'
        await supabaseAdmin
          .from('professionals')
          .update({ plan, ...getSubscriptionPeriod(sub) })
          .eq('id', profResult.id)
      }
    }
  }

  // Limpa stripe_subscription_id (nunca stripe_customer_id). Filtra por
  // stripe_subscription_id (não por customer) de propósito: se este evento
  // for sobre uma subscrição órfã já flagged como conflito (nunca chegou a
  // ficar registada na BD), este update não encontra nenhuma linha e não
  // faz nada — nunca limpa o ID da subscrição legítima por engano.
  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription
    await supabaseAdmin
      .from('professionals')
      .update({ plan: 'inactive', stripe_subscription_id: null })
      .eq('stripe_subscription_id', sub.id)
  }

  return NextResponse.json({ ok: true })
}
