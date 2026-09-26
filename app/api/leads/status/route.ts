import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createClient } from '@/lib/supabase-server'
import { isLeadAuthorized } from '@/lib/lead-authorization'
import { sendReviewRequestEmail } from '@/lib/complete-lead'
import { recordLeadStatusChange } from '@/lib/lead-status-history'

export const dynamic = 'force-dynamic'

const ERROR_MESSAGES: Record<string, string> = {
  not_found: 'Pedido não encontrado.',
  locked: 'Este pedido ainda não está desbloqueado.',
}

export async function POST(req: NextRequest) {
  try {
    const { lead_id, status, valor_fechado, valor_fechado_decision } = await req.json()

    const userClient = await createClient()
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { data: professional } = await supabaseAdmin
      .from('professionals')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!professional) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

    const { data: state } = await supabaseAdmin
      .from('leads')
      .select('id, professional_id, opened_at, source, locked, concluido_at, status')
      .eq('id', lead_id)
      .maybeSingle()

    // Mensagem genérica em ambos os casos (lead inexistente ou de outro
    // profissional) para não confirmar a um atacante que um lead_id existe.
    if (!state || state.professional_id !== professional.id) {
      return NextResponse.json({ error: ERROR_MESSAGES.not_found, reason: 'not_found' }, { status: 404 })
    }

    if (!isLeadAuthorized(state)) {
      return NextResponse.json({ error: ERROR_MESSAGES.locked, reason: 'locked' }, { status: 403 })
    }

    // Ao fechar, exige uma decisão explícita sobre o valor final — "informado"
    // (com valor válido) ou "nao_informar" (grava null de propósito). Nunca
    // avança silenciosamente sem nenhuma das duas escolhas.
    if (status === 'fechado') {
      if (valor_fechado_decision === 'informado') {
        if (typeof valor_fechado !== 'number' || !Number.isFinite(valor_fechado) || valor_fechado <= 0) {
          return NextResponse.json({ error: 'Valor final inválido.' }, { status: 400 })
        }
      } else if (valor_fechado_decision !== 'nao_informar') {
        return NextResponse.json({ error: 'É necessário indicar o valor final ou escolher "Prefiro não indicar".' }, { status: 400 })
      }
    }

    // valor_fechado só é tocado nesta transição — outros estados nunca
    // escrevem nem apagam o que já lá esteja (ex: reabrir e voltar a fechar).
    const updatePayload: Record<string, unknown> = { status }
    if (status === 'fechado') {
      updatePayload.valor_fechado = valor_fechado_decision === 'informado' ? valor_fechado : null
    }
    // concluido_at/concluido_by só são gravados na PRIMEIRA vez que o
    // trabalho é marcado como concluído — um reenvio do pedido de opinião
    // (chamar este mesmo endpoint outra vez com status='concluido' já
    // concluído) não pode reescrever quando o trabalho foi de facto
    // terminado.
    const isFirstCompletion = status === 'concluido' && !state.concluido_at
    if (isFirstCompletion) {
      updatePayload.concluido_at = new Date().toISOString()
      updatePayload.concluido_by = professional.id
    }

    const { error } = await supabaseAdmin
      .from('leads')
      .update(updatePayload)
      .eq('id', lead_id)
      .eq('professional_id', professional.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    // Percurso dos leads (admin) — só regista quando o estado muda mesmo
    // (nunca um resubmit do mesmo estado). Melhor esforço, nunca bloqueia a
    // resposta — a mudança de estado real já está gravada acima.
    if (state.status !== status) {
      recordLeadStatusChange({ leadId: lead_id, fromStatus: state.status, toStatus: status, changedBy: professional.id }).catch(() => {})
    }

    // Estado "Concluído" (distinto de "Fechado", que só fecha o valor
    // acordado): dispara o único email de pedido de opinião ao cliente. Fica
    // gravado como melhor esforço — uma falha de envio nunca reverte nem
    // bloqueia a conclusão já gravada acima; fica só registada em
    // notification_log e disponível para reenvio (ver lib/complete-lead.ts).
    if (status === 'concluido') {
      const emailResult = await sendReviewRequestEmail(lead_id)
      return NextResponse.json({ ok: true, email: emailResult })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
