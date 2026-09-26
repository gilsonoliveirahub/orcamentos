import { supabaseAdmin } from '@/lib/supabase-admin'

// Percurso dos leads — regista cada mudança de estado (novo → qualificado →
// visita → proposta → fechado/perdido) para o admin conseguir medir quanto
// tempo cada transição demora, não só ver o estado atual. Melhor esforço:
// chamado depois da própria mudança de estado já ter sido gravada em
// `leads` (ver app/api/leads/status/route.ts) — uma falha aqui nunca pode
// reverter nem bloquear essa escrita real.
export async function recordLeadStatusChange(params: {
  leadId: string
  fromStatus: string | null
  toStatus: string
  changedBy: string | null
}) {
  const { error } = await supabaseAdmin.from('lead_status_history').insert({
    lead_id: params.leadId,
    from_status: params.fromStatus,
    to_status: params.toStatus,
    changed_by: params.changedBy,
  })
  if (error) {
    console.error(`[lead-status-history] falha ao registar transição (lead ${params.leadId}): ${error.message}`)
  }
}
