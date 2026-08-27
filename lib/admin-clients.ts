// "Cliente" no CRM administrativo NÃO é uma entidade de negócio própria —
// é uma VISTA derivada de `leads`, agrupada por telefone. O produto não tem
// (nem precisa de) uma tabela `customers`: a tabela `clients` existente só
// cobre quem cria login de cliente (minoria), e o cruzamento real
// leads↔cliente já é feito por telefone em todo o código (ver
// app/cliente/dashboard/page.tsx). Este ficheiro só formaliza essa mesma
// leitura para uso administrativo — nunca grava nada, nunca inventa uma
// chave primária de cliente que não existe no schema.

export type LeadForClientView = {
  id: string
  phone: string | null
  name: string | null
  email: string | null
  status: string | null
  source: string | null
  valor_fechado: number | null
  created_at: string
  professional_id: string | null
  professional_name: string | null
}

export type AdminClientSummary = {
  phone: string
  name: string | null
  email: string | null
  leadsCount: number
  lastRequestAt: string
  professionals: Array<{ id: string; name: string }>
  fechadosCount: number
  perdidosCount: number
  valorFechadoTotal: number
}

/**
 * Agrupa leads por telefone (chave da vista "Cliente"). Leads sem telefone
 * são ignorados — não há como agrupar um cliente sem identificador nenhum,
 * e inventar uma chave sintética esconderia isso em vez de o mostrar.
 * Nome/email mostrados são os do pedido mais recente desse telefone (o mais
 * provável de estar atualizado), nunca uma mistura arbitrária.
 */
export function groupLeadsByClient(leads: LeadForClientView[]): AdminClientSummary[] {
  const byPhone = new Map<string, LeadForClientView[]>()
  for (const lead of leads) {
    if (!lead.phone) continue
    const list = byPhone.get(lead.phone) || []
    list.push(lead)
    byPhone.set(lead.phone, list)
  }

  const result: AdminClientSummary[] = []
  for (const [phone, phoneLeads] of byPhone) {
    const sorted = [...phoneLeads].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    const mostRecent = sorted[0]
    const fechados = phoneLeads.filter(l => l.status === 'fechado')
    const perdidos = phoneLeads.filter(l => l.status === 'perdido')
    const valorFechadoTotal = fechados.reduce((sum, l) => sum + (typeof l.valor_fechado === 'number' ? l.valor_fechado : 0), 0)

    const professionalsMap = new Map<string, string>()
    for (const l of phoneLeads) {
      if (l.professional_id && l.professional_name) professionalsMap.set(l.professional_id, l.professional_name)
    }

    result.push({
      phone,
      name: mostRecent.name,
      email: sorted.find(l => l.email)?.email ?? null,
      leadsCount: phoneLeads.length,
      lastRequestAt: mostRecent.created_at,
      professionals: Array.from(professionalsMap, ([id, name]) => ({ id, name })),
      fechadosCount: fechados.length,
      perdidosCount: perdidos.length,
      valorFechadoTotal,
    })
  }

  return result.sort((a, b) => new Date(b.lastRequestAt).getTime() - new Date(a.lastRequestAt).getTime())
}
