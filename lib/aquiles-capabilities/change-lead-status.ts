import { supabaseAdmin } from '@/lib/supabase-admin'
import { recordLeadStatusChange } from '@/lib/lead-status-history'
import { sendReviewRequestEmail } from '@/lib/complete-lead'
import type { CapabilityChange, CapabilityDefinition, CapabilityPreview } from './types'

export type ChangeLeadStatusParams = {
  lead_id: string
  status: string
  valor_fechado?: number
  valor_fechado_decision?: 'informado' | 'nao_informar'
}

type LeadRow = {
  id: string
  name: string | null
  phone: string | null
  status: string
  professional_id: string | null
  opened_at: string | null
  source: string | null
  locked: boolean | null
  concluido_at: string | null
  valor_fechado: number | null
}

async function fetchLead(leadId: string): Promise<LeadRow | null> {
  const { data } = await supabaseAdmin
    .from('leads')
    .select('id, name, phone, status, professional_id, opened_at, source, locked, concluido_at, valor_fechado')
    .eq('id', leadId)
    .maybeSingle()
  return (data as LeadRow | null) || null
}

function validateFechadoDecision(params: ChangeLeadStatusParams): string | null {
  if (params.status !== 'fechado') return null
  if (params.valor_fechado_decision === 'informado') {
    if (typeof params.valor_fechado !== 'number' || !Number.isFinite(params.valor_fechado) || params.valor_fechado <= 0) {
      return 'Valor final inválido para a decisão "informado"'
    }
    return null
  }
  if (params.valor_fechado_decision !== 'nao_informar') {
    return 'É necessário indicar o valor final ou escolher "Prefiro não indicar" ao fechar um lead'
  }
  return null
}

async function preview(params: ChangeLeadStatusParams): Promise<CapabilityPreview> {
  const lead = await fetchLead(params.lead_id)
  if (!lead) {
    return {
      capability_id: 'change-lead-status',
      found: false,
      not_found_reason: 'Lead não encontrado',
      target_summary: `Lead ${params.lead_id}`,
      changes: [],
      effects: [],
      blocked: true,
      blocked_reason: 'Lead não encontrado',
    }
  }

  const decisionError = validateFechadoDecision(params)
  const changes: CapabilityChange[] = [{ field: 'status', before: lead.status, after: params.status }]
  if (params.status === 'fechado') {
    changes.push({ field: 'valor_fechado', before: lead.valor_fechado, after: params.valor_fechado_decision === 'informado' ? params.valor_fechado : null })
  }

  const effects = []
  if (params.status === 'concluido' && !lead.concluido_at) {
    effects.push({ label: 'Dispara email de pedido de opinião ao cliente, se tiver email (primeira conclusão)' })
  }
  effects.push({ label: 'Regista a transição em lead_status_history' })

  return {
    capability_id: 'change-lead-status',
    found: true,
    target_summary: `Lead de ${lead.name || lead.phone || lead.id}`,
    changes,
    effects,
    blocked: !!decisionError,
    blocked_reason: decisionError || undefined,
  }
}

async function execute(params: ChangeLeadStatusParams) {
  const lead = await fetchLead(params.lead_id)
  if (!lead) throw new Error('Lead não encontrado')

  const decisionError = validateFechadoDecision(params)
  if (decisionError) throw new Error(decisionError)

  const updatePayload: Record<string, unknown> = { status: params.status }
  if (params.status === 'fechado') {
    updatePayload.valor_fechado = params.valor_fechado_decision === 'informado' ? params.valor_fechado : null
  }
  const isFirstCompletion = params.status === 'concluido' && !lead.concluido_at
  if (isFirstCompletion) {
    updatePayload.concluido_at = new Date().toISOString()
    updatePayload.concluido_by = lead.professional_id
  }

  const { error } = await supabaseAdmin.from('leads').update(updatePayload).eq('id', params.lead_id)
  if (error) throw new Error(error.message)

  if (lead.status !== params.status) {
    // changed_by fica null (é uma ação administrativa via Aquiles, não de um
    // profissional) — a autoria real fica em aquiles_pending_actions
    // (ctx.actionId), não nesta coluna que só referencia professionals(id).
    await recordLeadStatusChange({ leadId: params.lead_id, fromStatus: lead.status, toStatus: params.status, changedBy: null })
  }

  if (params.status === 'concluido') {
    const emailResult = await sendReviewRequestEmail(params.lead_id)
    return { status: params.status, email: emailResult }
  }

  return { status: params.status }
}

export const changeLeadStatusCapability: CapabilityDefinition<ChangeLeadStatusParams> = {
  id: 'change-lead-status',
  actionType: 'other_sensitive',
  description: 'Mudar o estado de qualquer lead (em nome do profissional dono) — mesmas regras de valor fechado/primeira conclusão/email do fluxo normal.',
  preview,
  execute,
}
