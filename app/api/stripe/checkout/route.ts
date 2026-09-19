import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolvePriceId, isPlanTier, isBillingCycle, PLAN_RANK, classifyPriceId, isNonTerminalSubscriptionStatus, type PlanTier, type BillingCycle } from '@/lib/stripe-plans'
import { acquireCheckoutLock, attachCheckoutSession, releaseCheckoutLock, isLockStale, resumeStaleLock, replaceExpiredLock } from '@/lib/checkout-lock'
import { flagSubscriptionConflict } from '@/lib/subscription-conflicts'
import { getSubscriptionPeriod } from '@/lib/stripe-subscription-period'

export const dynamic = 'force-dynamic'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-03-25.dahlia' })

type LockResolution =
  | { type: 'fresh'; idempotencyKey: string; plan: string; cycle: string; resumed: boolean }
  | { type: 'reuse_url'; url: string | null }
  | { type: 'already_complete' }
  | { type: 'busy' }
  | { type: 'integrity_error' }

/**
 * Reserva atómica por profissional (lib/checkout-lock.ts) — impede dois
 * pedidos concorrentes de checkout para a mesma conta, cobrindo tanto a
 * criação de uma Checkout Session nova como as alterações a uma subscrição
 * já existente (upgrade/downgrade/troca de ciclo).
 *
 * `plan`/`cycle` devolvidos podem DIFERIR dos pedidos pelo chamador quando
 * `resumed: true` — nesse caso está a retomar uma operação anterior
 * obsoleta (ver resumeStaleLock em lib/checkout-lock.ts, requisito 1 da
 * revisão adversarial), e é essa operação, não o pedido atual, que tem de
 * ser completada em segurança.
 */
async function resolveLock(professionalId: string, plan: string, cycle: string, attempt = 0): Promise<LockResolution> {
  const result = await acquireCheckoutLock(professionalId, plan, cycle)
  if (result.ok) return { type: 'fresh', idempotencyKey: result.idempotencyKey, plan, cycle, resumed: false }

  const lock = result.lock

  if (lock.checkout_session_id) {
    // Já há uma Checkout Session associada a esta reserva — pergunta ao
    // Stripe o estado REAL dela (nunca confia num relógio local).
    const session = await stripe.checkout.sessions.retrieve(lock.checkout_session_id)

    // Requisito 4: nunca reutiliza só porque existe um session_id — a
    // identidade da sessão é sempre decidida pelos metadados que NÓS
    // pusemos ao criá-la (professional_id/plan/cycle), nunca inferida só
    // do customer/email. Se não corresponder à própria reserva que a
    // criou, é um estado que nunca deveria existir — nunca confia, regista
    // e recusa em vez de assumir que está tudo bem.
    const belongsToThisLock =
      session.metadata?.professional_id === professionalId &&
      session.metadata?.plan === lock.plan &&
      session.metadata?.cycle === lock.cycle

    if (!belongsToThisLock) {
      await flagSubscriptionConflict({
        professionalId,
        existingSubscriptionId: null,
        newSubscriptionId: session.id,
        source: 'checkout_reconciliation',
      })
      return { type: 'integrity_error' }
    }

    if (session.status === 'open') {
      if (lock.plan === plan && lock.cycle === cycle) return { type: 'reuse_url', url: session.url }
      // Sessão real e válida, mas para um plano/ciclo DIFERENTE do que
      // este pedido está a escolher agora — nunca troca "por baixo" de uma
      // operação em curso; o profissional tem de a completar (ou deixá-la
      // expirar) antes de poder escolher outra coisa.
      return { type: 'busy' }
    }
    if (session.status === 'complete') return { type: 'already_complete' }

    // Terminal (expired, ou qualquer outro estado que não seja open nem
    // complete) — só agora é seguro abrir uma operação nova, com chave
    // nova. Troca atómica (ver replace_expired_checkout_lock na migração).
    const replaced = await replaceExpiredLock(professionalId, lock.idempotency_key, plan, cycle)
    if (!replaced.replaced || !replaced.idempotencyKey) {
      // Outro pedido já tratou disto entretanto — repete a resolução do
      // zero em vez de assumir que ficámos com a reserva.
      if (attempt >= 2) return { type: 'busy' }
      return resolveLock(professionalId, plan, cycle, attempt + 1)
    }
    return { type: 'fresh', idempotencyKey: replaced.idempotencyKey, plan, cycle, resumed: false }
  }

  if (!isLockStale(lock)) return { type: 'busy' }

  // Requisito 1: sem sessão associada e já obsoleta — nunca sabemos se o
  // Stripe recebeu ou não o pedido original (só a escrita local é que pode
  // ter falhado). Retoma a MESMA operação (mesma chave, mesmo plano/ciclo
  // já guardados na reserva) — nunca uma chave nova.
  const resumed = resumeStaleLock(lock)
  return { type: 'fresh', idempotencyKey: resumed.idempotencyKey, plan: resumed.plan, cycle: resumed.cycle, resumed: true }
}

/**
 * Requisito 5: nunca verifica só `status: 'active'` nem só a primeira
 * página — trialing/past_due/unpaid/incomplete já são subscrições reais, e
 * um cliente Stripe pode (em teoria) ter mais de 100.
 */
async function listNonTerminalSubscriptions(customerId: string): Promise<Stripe.Subscription[]> {
  const nonTerminal: Stripe.Subscription[] = []
  let startingAfter: string | undefined
  for (;;) {
    const page = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    })
    nonTerminal.push(...page.data.filter(s => isNonTerminalSubscriptionStatus(s.status)))
    if (!page.has_more) break
    startingAfter = page.data[page.data.length - 1].id
  }
  return nonTerminal
}

export async function POST(req: NextRequest) {
  try {
    const { professional_id, plan: requestedPlan = 'starter', cycle: requestedCycle = 'monthly' } = await req.json()

    // Lista fechada (lib/stripe-plans.ts) — o pedido só manda plano e ciclo,
    // nunca um Price ID nem um valor.
    if (!isPlanTier(requestedPlan)) {
      return NextResponse.json({ error: 'Plano inválido' }, { status: 400 })
    }
    if (!isBillingCycle(requestedCycle)) {
      return NextResponse.json({ error: 'Ciclo de faturação inválido' }, { status: 400 })
    }
    if (!resolvePriceId(requestedPlan, requestedCycle)) {
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

    const lockResolution = await resolveLock(prof.id, requestedPlan, requestedCycle)

    if (lockResolution.type === 'busy') {
      return NextResponse.json({
        error: 'Já existe uma operação de checkout em curso para esta conta. Tenta novamente dentro de momentos.',
      }, { status: 409 })
    }
    if (lockResolution.type === 'integrity_error') {
      return NextResponse.json({
        error: 'Não foi possível confirmar a operação em curso para esta conta. Contacta o suporte.',
      }, { status: 409 })
    }
    if (lockResolution.type === 'reuse_url') {
      return NextResponse.json({ url: lockResolution.url })
    }
    if (lockResolution.type === 'already_complete') {
      return NextResponse.json({
        error: 'Este pagamento já foi concluído — atualiza a página para veres o teu plano atual.',
      }, { status: 400 })
    }

    // A operação EFETIVA pode ser a retomada de uma reserva obsoleta
    // (plano/ciclo/chave diferentes do que este pedido concreto pediu) —
    // é essa operação, nunca o pedido atual, que tem de ser completada.
    // plan/cycle já validados como PlanTier/BillingCycle — quer venham do
    // pedido atual (isPlanTier/isBillingCycle acima), quer de uma reserva
    // retomada (só escrita por este mesmo código, sempre com esses tipos).
    const { idempotencyKey, plan, cycle, resumed } = lockResolution as { idempotencyKey: string; plan: PlanTier; cycle: BillingCycle; resumed: boolean }
    const priceId = resolvePriceId(plan, cycle)!

    function finalize(response: NextResponse): NextResponse {
      if (!resumed || (plan === requestedPlan && cycle === requestedCycle)) return response
      // A operação retomada era diferente da que este pedido concreto
      // queria agora — os efeitos já foram aplicados corretamente (nunca
      // se perde nem duplica nada), mas nunca devolve isto como se fosse o
      // que o browser pediu agora.
      return NextResponse.json({
        error: 'Havia uma operação anterior pendente para esta conta, agora resolvida. Escolhe o teu plano novamente.',
      }, { status: 409 })
    }

    // Já tem uma subscrição Stripe ativa — nunca cria uma segunda. Muda a
    // MESMA subscrição, mantendo o mesmo cliente e a mesma data de renovação.
    if (prof.stripe_subscription_id) {
      try {
        const sub = await stripe.subscriptions.retrieve(prof.stripe_subscription_id)
        const item = sub.items.data[0]
        if (!item) return NextResponse.json({ error: 'Subscrição sem item ativo' }, { status: 500 })

        if (item.price?.id === priceId) {
          return finalize(NextResponse.json({ error: 'Já tens este plano e ciclo ativos' }, { status: 400 }))
        }

        const isUpgrade = (PLAN_RANK[plan as keyof typeof PLAN_RANK] ?? 0) > (PLAN_RANK[prof.plan as keyof typeof PLAN_RANK] ?? 0)

        if (!isUpgrade) {
          // Downgrade (ou troca de ciclo no mesmo tier): agendado via
          // Subscription Schedule, nunca aplicado agora — ver comentário
          // completo na versão anterior desta rota (git blame).
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

          await supabaseAdmin.from('professionals').update({ pending_plan: plan }).eq('id', professional_id)
          return finalize(NextResponse.json({ ok: true, deferred: true }))
        }

        // Upgrade de tier: aplicado imediatamente, com proration.
        let updatedSub: Stripe.Subscription
        try {
          if (sub.schedule) {
            await stripe.subscriptionSchedules.release(sub.schedule as string)
          }
          updatedSub = await stripe.subscriptions.update(prof.stripe_subscription_id, {
            items: [{ id: item.id, price: priceId }],
            proration_behavior: 'create_prorations',
            payment_behavior: 'error_if_incomplete',
          }, { idempotencyKey })
        } catch (err: any) {
          return NextResponse.json({ error: err.message || 'Falha ao cobrar a diferença do upgrade' }, { status: 402 })
        }

        const period = getSubscriptionPeriod(updatedSub)
        await supabaseAdmin
          .from('professionals')
          .update({ plan, pending_plan: null, ...period })
          .eq('id', professional_id)

        return finalize(NextResponse.json({ ok: true }))
      } finally {
        // Upgrade/downgrade são síncronos dentro deste pedido — a reserva
        // nunca precisa de sobreviver depois da resposta. Condicionado por
        // (professional_id, idempotencyKey) — requisito 2 — nunca liberta
        // uma reserva mais recente que possa já ter substituído esta.
        await releaseCheckoutLock(prof.id, idempotencyKey)
      }
    }

    // Nesta secção a reserva só é libertada no fim quando a sessão NUNCA
    // chegou a ser criada no Stripe (recusada, ou a própria chamada falhou)
    // — nos outros dois casos (sessão criada com sucesso, ou criada mas a
    // escrita local do id falhou a seguir) a reserva fica sempre, porque o
    // desfecho real só se sabe mais tarde ou porque libertá-la agora criaria
    // exatamente o risco do requisito 1: uma segunda sessão real, com uma
    // chave nova, na próxima tentativa, sem saber se a primeira já tinha
    // sido aceite pelo Stripe.
    let keepLock = false
    let sessionCreated = false
    try {
      // Reconciliação com o Stripe — nunca procura por email, só pelo
      // stripe_customer_id já pertencente a este profissional autenticado.
      if (prof.stripe_customer_id) {
        const nonTerminal = await listNonTerminalSubscriptions(prof.stripe_customer_id)

        if (nonTerminal.length > 1) {
          await flagSubscriptionConflict({
            professionalId: prof.id,
            existingSubscriptionId: prof.stripe_subscription_id,
            newSubscriptionId: nonTerminal.map(s => s.id).join(','),
            source: 'checkout_reconciliation',
          })
          return finalize(NextResponse.json({
            error: 'Detetámos mais do que uma subscrição associada à tua conta. Contacta o suporte antes de continuares.',
          }, { status: 409 }))
        }

        if (nonTerminal.length === 1) {
          const sub = nonTerminal[0]
          const classified = classifyPriceId(sub.items.data[0]?.price?.id)
          await supabaseAdmin
            .from('professionals')
            .update({
              plan: classified?.plan || prof.plan,
              stripe_subscription_id: sub.id,
              ...getSubscriptionPeriod(sub),
            })
            .eq('id', prof.id)
          return finalize(NextResponse.json({
            error: 'Já tens uma subscrição ativa associada a esta conta — atualiza a página.',
          }, { status: 400 }))
        }
      }

      // Sem subscrição ativa — primeira assinatura OU reassinatura depois de
      // um cancelamento. metadata identifica a sessão de forma inequívoca
      // (usado por resolveLock acima, requisito 4, e pelo webhook para
      // libertar a reserva certa e cruzar identidade — requisito 6);
      // subscription_data.metadata propaga o professional_id/plan/cycle
      // para a própria Subscription criada, dando ao webhook um segundo
      // sinal de identidade além do stripe_customer_id.
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        ...(prof.stripe_customer_id
          ? { customer: prof.stripe_customer_id }
          : { customer_email: prof.email }),
        metadata: { professional_id: prof.id, plan, cycle, checkout_idempotency_key: idempotencyKey },
        subscription_data: { metadata: { professional_id: prof.id, plan, cycle } },
        line_items: [{ price: priceId, quantity: 1 }],
        automatic_tax: { enabled: true },
        success_url: `${appUrl}/upgrade?success=1`,
        cancel_url: `${appUrl}/upgrade?cancelled=1`,
      }, { idempotencyKey })
      sessionCreated = true

      // Requisito 1: se esta escrita falhar (rede, timeout do lado da BD),
      // a sessão JÁ EXISTE no Stripe — o `finally` abaixo nunca liberta a
      // reserva neste caso (sessionCreated=true, keepLock=false continua a
      // significar "não sabemos ainda", não "está livre"). Uma tentativa
      // futura retoma esta MESMA operação com a MESMA idempotencyKey
      // (resumeStaleLock), o que devolve esta mesma sessão em cache no
      // Stripe em vez de criar uma segunda.
      await attachCheckoutSession(prof.id, idempotencyKey, session.id)
      keepLock = true

      return finalize(NextResponse.json({ url: session.url }))
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 500 })
    } finally {
      if (!keepLock && !sessionCreated) await releaseCheckoutLock(prof.id, idempotencyKey)
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
