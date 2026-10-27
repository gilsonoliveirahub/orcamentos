import { editProfessionalCapability } from './edit-professional'
import { changeLeadStatusCapability } from './change-lead-status'
import { unlockMarketplaceLeadCapability } from './unlock-marketplace-lead'
import { manageReviewInviteCapability } from './manage-review-invite'
import type { CapabilityDefinition } from './types'

// Lista fechada, explícita — nunca dinâmica/eval. Qualquer capacidade nova
// entra aqui, nunca por uma rota nova. NUNCA incluir aqui nada que gira
// permissões/credenciais/aprovações do próprio Aquiles (admins,
// aquiles_pending_actions, roles, tokens) — exclusão deliberada e
// permanente, não uma lacuna a preencher depois.
export const AQUILES_CAPABILITIES = {
  'edit-professional': editProfessionalCapability,
  'change-lead-status': changeLeadStatusCapability,
  'unlock-marketplace-lead': unlockMarketplaceLeadCapability,
  'manage-review-invite': manageReviewInviteCapability,
} as const

export type AquilesCapabilityId = keyof typeof AQUILES_CAPABILITIES

export function getCapability(id: string): CapabilityDefinition | null {
  if (Object.prototype.hasOwnProperty.call(AQUILES_CAPABILITIES, id)) {
    return AQUILES_CAPABILITIES[id as AquilesCapabilityId] as unknown as CapabilityDefinition
  }
  return null
}
