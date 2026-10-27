import { supabaseAdmin } from '@/lib/supabase-admin'
import { EDITABLE_PROFESSIONAL_FIELDS } from '@/lib/professional-editable-fields'
import type { CapabilityDefinition, CapabilityPreview } from './types'

export type EditProfessionalParams = {
  professional_id: string
  updates: Partial<Record<string, unknown>>
}

function pickEditable(updates: Partial<Record<string, unknown>>) {
  const picked: Partial<Record<string, unknown>> = {}
  for (const field of EDITABLE_PROFESSIONAL_FIELDS) {
    if (field in updates) picked[field] = updates[field]
  }
  return picked
}

async function preview(params: EditProfessionalParams): Promise<CapabilityPreview> {
  const updates = pickEditable(params.updates || {})
  const fields = Object.keys(updates)

  const { data: professional } = await supabaseAdmin
    .from('professionals')
    .select(['name', ...EDITABLE_PROFESSIONAL_FIELDS].join(','))
    .eq('id', params.professional_id)
    .maybeSingle()

  if (!professional) {
    return {
      capability_id: 'edit-professional',
      found: false,
      not_found_reason: 'Profissional não encontrado',
      target_summary: `Profissional ${params.professional_id}`,
      changes: [],
      effects: [],
      blocked: true,
      blocked_reason: 'Profissional não encontrado',
    }
  }

  const before = professional as unknown as Record<string, unknown>

  if (fields.length === 0) {
    return {
      capability_id: 'edit-professional',
      found: true,
      target_summary: `${before.name}`,
      changes: [],
      effects: [],
      blocked: true,
      blocked_reason: 'Nenhum campo editável foi submetido',
    }
  }

  const changes = fields.map(field => ({ field, before: before[field], after: updates[field] }))

  return {
    capability_id: 'edit-professional',
    found: true,
    target_summary: `${before.name}`,
    changes,
    effects: [{ label: 'Fica registado em admin_audit_log, ligado a esta aprovação' }],
    blocked: false,
  }
}

async function execute(params: EditProfessionalParams, ctx: { actionId: string; approvedByAdminId: string | null }) {
  const updates = pickEditable(params.updates || {})
  if (Object.keys(updates).length === 0) throw new Error('Nenhum campo editável foi submetido')

  const selectFields = EDITABLE_PROFESSIONAL_FIELDS.join(',')

  const { data: before, error: beforeError } = await supabaseAdmin
    .from('professionals')
    .select(selectFields)
    .eq('id', params.professional_id)
    .single()
  if (beforeError || !before) throw new Error('Profissional não encontrado')

  const { data: after, error: updateError } = await supabaseAdmin
    .from('professionals')
    .update(updates)
    .eq('id', params.professional_id)
    .select(selectFields)
    .single()
  if (updateError || !after) throw new Error(updateError?.message || 'Falha ao atualizar')

  const beforeRecord = before as unknown as Record<string, unknown>
  const afterRecord = after as unknown as Record<string, unknown>
  const changes: Record<string, { before: unknown; after: unknown }> = {}
  for (const field of Object.keys(updates)) {
    changes[field] = { before: beforeRecord[field], after: afterRecord[field] }
  }

  if (!ctx.approvedByAdminId) throw new Error('Ação sem admin aprovador identificado — recusado por segurança')

  const { error: auditError } = await supabaseAdmin.from('admin_audit_log').insert({
    admin_id: ctx.approvedByAdminId,
    professional_id: params.professional_id,
    changes,
    aquiles_action_id: ctx.actionId,
  })
  if (auditError) {
    console.error(`[aquiles-capabilities/edit-professional] falha ao registar auditoria: ${auditError.message}`)
  }

  return { professional: after, changes }
}

export const editProfessionalCapability: CapabilityDefinition<EditProfessionalParams> = {
  id: 'edit-professional',
  actionType: 'other_sensitive',
  description: 'Editar nome/telefone/especialidades/zona/descrição/ativo de um profissional — mesmos campos e auditoria do painel admin.',
  preview,
  execute,
}
