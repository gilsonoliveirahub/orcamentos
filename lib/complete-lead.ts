import { supabaseAdmin } from '@/lib/supabase-admin'
import { emailPedidoDepoimento } from '@/lib/email'

// Mesmo padrão de lib/notify-lead.ts (log + verificação de idempotência antes
// de qualquer envio) — aqui aplicado ao pedido de opinião enviado quando um
// profissional marca um trabalho como "Concluído". channel fica sempre
// 'email' (só existe este canal para este pedido); kind='review_request'
// distingue-o dos registos de notificação de "novo lead" para o mesmo
// lead_id (kind='lead_notification', omitido por omissão da coluna).
async function logNotification(params: {
  leadId: string
  professionalId: string | null
  status: 'sent' | 'failed' | 'skipped'
  reason?: string | null
}) {
  const { error } = await supabaseAdmin.from('notification_log').insert({
    lead_id: params.leadId,
    professional_id: params.professionalId,
    channel: 'email',
    kind: 'review_request',
    status: params.status,
    reason: params.reason ?? null,
  })
  if (error) console.error(`[complete-lead] falha ao registar notification_log: ${error.message}`)
}

async function hasAlreadySentReviewRequest(leadId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('notification_log')
    .select('id')
    .eq('lead_id', leadId)
    .eq('kind', 'review_request')
    .eq('status', 'sent')
    .limit(1)
  return Array.isArray(data) && data.length > 0
}

async function hasReview(leadId: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from('reviews').select('id').eq('lead_id', leadId).maybeSingle()
  return !!data
}

export type SendReviewRequestResult =
  | { status: 'sent' }
  | { status: 'skipped'; reason: 'already_sent' | 'already_reviewed' | 'no_email' }
  | { status: 'failed'; reason: string }

// Chamada tanto na conclusão inicial do trabalho como num reenvio manual
// (clicar outra vez em "Concluído"/"Reenviar pedido de opinião") — o próprio
// endpoint que a chama (app/api/leads/status/route.ts) é o mesmo nos dois
// casos, por isso toda a proteção contra duplicados vive aqui dentro:
// nunca envia uma segunda vez se já houver um envio 'sent' registado, e
// nunca envia se o cliente já deixou a opinião (não faz sentido continuar a
// pedir). Nunca lança — uma falha de email não pode impedir a resposta da
// rota nem reverter a conclusão do trabalho já gravada na BD.
export async function sendReviewRequestEmail(leadId: string): Promise<SendReviewRequestResult> {
  const { data: lead } = await supabaseAdmin
    .from('leads')
    .select('id, name, email, professional_id, professionals(name)')
    .eq('id', leadId)
    .maybeSingle()

  if (!lead) return { status: 'failed', reason: 'Pedido não encontrado.' }

  if (await hasReview(leadId)) {
    await logNotification({ leadId, professionalId: lead.professional_id, status: 'skipped', reason: 'already_reviewed' })
    return { status: 'skipped', reason: 'already_reviewed' }
  }

  if (await hasAlreadySentReviewRequest(leadId)) {
    return { status: 'skipped', reason: 'already_sent' }
  }

  if (!lead.email) {
    await logNotification({ leadId, professionalId: lead.professional_id, status: 'skipped', reason: 'no_email' })
    return { status: 'skipped', reason: 'no_email' }
  }

  const prof = lead.professionals as unknown as { name?: string } | null

  try {
    await emailPedidoDepoimento({
      tipo: 'cliente',
      name: lead.name || 'Cliente',
      email: lead.email,
      outroNome: prof?.name || 'o profissional',
      lead_id: lead.id,
    })
    await logNotification({ leadId, professionalId: lead.professional_id, status: 'sent' })
    return { status: 'sent' }
  } catch (err: any) {
    console.error(`[complete-lead] email de pedido de opinião não enviado (lead ${leadId}): ${err.message}`)
    await logNotification({ leadId, professionalId: lead.professional_id, status: 'failed', reason: err.message })
    return { status: 'failed', reason: err.message }
  }
}
