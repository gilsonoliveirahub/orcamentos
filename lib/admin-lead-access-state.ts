// Estado de acesso de um lead, só para exibição/filtro no CRM administrativo
// — deriva-se sempre de source/opened_at/professional_id/locked, nunca uma
// coluna própria. Espelha a mesma leitura que lib/lead-authorization.ts já
// faz para decidir se os dados de contacto podem ser revelados, mas aqui
// distinguindo os 4 estados que interessam ao admin (isLeadAuthorized só
// distingue autorizado/não autorizado, dois a dois).
//
//   pessoal + opened_at preenchido      → 'aberto'      (consumiu quota, dados revelados)
//   pessoal + opened_at nulo            → 'bloqueado'    (ainda não foi aberto)
//   marketplace + professional_id nulo  → 'disponivel'   (ninguém adquiriu ainda)
//   marketplace + professional_id preenchido → 'adquirido' (dados revelados a quem adquiriu)
//   qualquer outro caso (source nulo/antigo) → 'desconhecido' (nunca inventa um dos 4 estados acima)

export type AdminLeadAccessState = 'aberto' | 'bloqueado' | 'disponivel' | 'adquirido' | 'desconhecido'

export type LeadForAccessState = {
  source: string | null
  opened_at: string | null
  professional_id: string | null
}

export function getAdminLeadAccessState(lead: LeadForAccessState): AdminLeadAccessState {
  if (lead.source === 'pessoal') return lead.opened_at ? 'aberto' : 'bloqueado'
  if (lead.source === 'marketplace') return lead.professional_id ? 'adquirido' : 'disponivel'
  return 'desconhecido'
}

export const ADMIN_LEAD_ACCESS_STATE_LABELS: Record<AdminLeadAccessState, string> = {
  aberto: 'Aberto',
  bloqueado: 'Bloqueado',
  disponivel: 'Disponível',
  adquirido: 'Adquirido',
  desconhecido: 'Desconhecido',
}
