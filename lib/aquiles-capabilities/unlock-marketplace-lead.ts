import { supabaseAdmin } from '@/lib/supabase-admin'
import { emailLeadDesbloqueado } from '@/lib/email'
import type { CapabilityDefinition, CapabilityPreview } from './types'

export type UnlockMarketplaceLeadParams = {
  lead_id: string
  professional_id: string
}

const ERROR_MESSAGES: Record<string, string> = {
  not_found: 'Pedido ou profissional não encontrado',
  credits: 'Profissional sem créditos de marketplace',
}

async function preview(params: UnlockMarketplaceLeadParams): Promise<CapabilityPreview> {
  const [{ data: lead }, { data: professional }] = await Promise.all([
    supabaseAdmin.from('leads').select('id, name, phone, locked, professional_id, source').eq('id', params.lead_id).maybeSingle(),
    supabaseAdmin.from('professionals').select('id, name, marketplace_credits').eq('id', params.professional_id).maybeSingle(),
  ])

  if (!lead || !professional) {
    return {
      capability_id: 'unlock-marketplace-lead',
      found: false,
      not_found_reason: !lead ? 'Lead não encontrado' : 'Profissional não encontrado',
      target_summary: `Lead ${params.lead_id} / profissional ${params.professional_id}`,
      changes: [],
      effects: [],
      blocked: true,
      blocked_reason: !lead ? 'Lead não encontrado' : 'Profissional não encontrado',
    }
  }

  if (lead.professional_id !== params.professional_id) {
    return {
      capability_id: 'unlock-marketplace-lead',
      found: true,
      target_summary: `Lead de ${lead.name || lead.phone}`,
      changes: [],
      effects: [],
      blocked: true,
      blocked_reason: 'Este lead não está atribuído a este profissional',
    }
  }

  const credits = professional.marketplace_credits ?? 0
  const alreadyUnlocked = lead.locked === false
  const blocked = !alreadyUnlocked && credits < 1

  return {
    capability_id: 'unlock-marketplace-lead',
    found: true,
    target_summary: `Lead de ${lead.name || lead.phone} → profissional ${professional.name}`,
    changes: alreadyUnlocked
      ? []
      : [
          { field: 'leads.locked', before: true, after: false },
          { field: 'professionals.marketplace_credits', before: credits, after: credits - 1 },
        ],
    effects: alreadyUnlocked
      ? [{ label: 'Já estava desbloqueado — nenhuma alteração, nenhum crédito gasto' }]
      : [{ label: 'Envia email de confirmação de desbloqueio ao profissional' }],
    blocked,
    blocked_reason: blocked ? ERROR_MESSAGES.credits : undefined,
  }
}

async function execute(params: UnlockMarketplaceLeadParams) {
  const { data: result } = await supabaseAdmin.rpc('unlock_marketplace_lead_by_credit', {
    p_lead_id: params.lead_id,
    p_professional_id: params.professional_id,
  })

  if (!result?.ok) {
    const reason = result?.error ?? 'not_found'
    throw new Error(ERROR_MESSAGES[reason] ?? 'Falha ao desbloquear')
  }

  if (result.already_unlocked) {
    return { already_unlocked: true }
  }

  const [{ data: lead }, { data: professional }] = await Promise.all([
    supabaseAdmin.from('leads').select('id, name, phone, email').eq('id', params.lead_id).single(),
    supabaseAdmin.from('professionals').select('name, email').eq('id', params.professional_id).single(),
  ])

  if (lead && professional) {
    emailLeadDesbloqueado({
      profName: professional.name,
      profEmail: professional.email,
      leadName: lead.name || '—',
      leadPhone: lead.phone || '—',
      leadEmail: lead.email,
      leadId: lead.id,
    }).catch(() => {})
  }

  return { already_unlocked: false }
}

export const unlockMarketplaceLeadCapability: CapabilityDefinition<UnlockMarketplaceLeadParams> = {
  id: 'unlock-marketplace-lead',
  actionType: 'money_movement',
  description: 'Desbloquear um lead do marketplace já atribuído, gastando 1 crédito do profissional — mesma RPC atómica do fluxo normal.',
  preview,
  execute,
}
