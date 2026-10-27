import type { AquilesActionType } from '@/lib/aquiles-actions'

// Registo genérico de capacidades administrativas dadas ao Aquiles — cada
// capacidade nova é só isto (preview + execute), nunca uma rota/migração à
// parte. Nunca incluir aqui nada que giria permissões, credenciais ou
// aprovações do próprio Aquiles (admins, aquiles_pending_actions, roles,
// tokens) — essa exclusão é deliberada e permanente.

export type CapabilityChange = { field: string; before: unknown; after: unknown }
export type CapabilityEffect = { label: string }

export type CapabilityPreview = {
  capability_id: string
  found: boolean
  not_found_reason?: string
  target_summary: string
  changes: CapabilityChange[]
  effects: CapabilityEffect[]
  blocked: boolean
  blocked_reason?: string
}

export type CapabilityExecuteContext = {
  actionId: string
  approvedByAdminId: string | null
}

export type CapabilityDefinition<P = Record<string, unknown>> = {
  id: string
  actionType: AquilesActionType
  description: string
  preview: (params: P) => Promise<CapabilityPreview>
  execute: (params: P, ctx: CapabilityExecuteContext) => Promise<Record<string, unknown>>
}
