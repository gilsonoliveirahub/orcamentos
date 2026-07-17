export type LeadAuthorizationState = {
  opened_at: string | null
  source: string | null
  locked: boolean | null
}

/**
 * Um lead está "autorizado" quando os dados de contacto do cliente já podem
 * ser revelados: já foi aberto (link pessoal, consumiu quota do ciclo) ou já
 * foi adquirido no marketplace (professional_id preenchido e locked=false —
 * cobre tanto a aquisição do pool novo como o desbloqueio antigo por crédito
 * em /api/leads/unlock). Espelha lead_is_authorized() em
 * supabase/migration_marketplace_v3_atomic.sql — mantém os dois em sincronia.
 *
 * Isto é só a última linha de defesa em código que já corre com a service
 * role (supabaseAdmin), por isso não pode ser contornado (nunca chega antes
 * disso a ser confiado a partir da UI); a proteção real e inultrapassável
 * é ao nível da base de dados (REVOKE de colunas + dashboard_leads()).
 */
export function isLeadAuthorized(lead: LeadAuthorizationState): boolean {
  if (lead.opened_at) return true
  return lead.source === 'marketplace' && !lead.locked
}
