import { supabaseAdmin } from '@/lib/supabase-admin'
import { PERSONAL_LINK_PLAN_LIMITS, getCycleWindow, type SubscriptionPeriod } from '@/lib/personal-link-limits-shared'
import { getEffectivePlan } from '@/lib/effective-plan'

// As constantes/cálculos puros (sem dependência de supabaseAdmin) vivem em
// lib/personal-link-limits-shared.ts — esse ficheiro é seguro de importar
// a partir de componentes cliente (app/dashboard/page.tsx). Este ficheiro
// (com supabaseAdmin) NUNCA pode ser importado por um componente 'use
// client': o bundle do browser rebentaria com "supabaseKey is required",
// porque supabaseAdmin inicializa-se de forma eager com a chave de
// service role, que nunca está disponível no browser.
export { PERSONAL_LINK_PLAN_LIMITS, getCycleWindow, type SubscriptionPeriod }

export type OpenLeadResult =
  | { ok: true; alreadyOpen: boolean }
  | { ok: false; error: 'plan' | 'quota' | 'not_found' }

type OpenLeadRpcResult =
  | { ok: true; already_open: boolean }
  | { ok: false; error: 'plan' | 'quota' | 'not_found' }

/**
 * Abre um lead do link pessoal, se possível. Tudo (confirmar dono/origem,
 * confirmar se já foi aberto, confirmar plano e quota do ciclo, e marcar
 * opened_at) acontece numa única transação da função SQL
 * open_personal_lead() — incluindo a abertura simultânea de dois leads na
 * última vaga disponível da quota, que fica serializada pelo bloqueio da
 * linha do profissional dentro dessa função (só um dos dois consome a
 * última vaga; o outro recebe 'quota').
 */
export async function openPersonalLead(params: { leadId: string; professionalId: string }): Promise<OpenLeadResult> {
  const { leadId, professionalId } = params

  const { data, error } = await supabaseAdmin.rpc('open_personal_lead', {
    p_lead_id: leadId,
    p_professional_id: professionalId,
  })

  if (error || !data) return { ok: false, error: 'not_found' }

  const result = data as OpenLeadRpcResult
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, alreadyOpen: result.already_open }
}

/**
 * Verificação só de leitura (não abre nada, não consome quota) — usada
 * pelas notificações/follow-ups para decidir se é seguro revelar dados de
 * contacto num lead do link pessoal ainda não aberto: se a quota do ciclo
 * já estiver esgotada, abrir mais tarde não seria autorizado, por isso a
 * notificação também não deve revelar os dados agora.
 */
export async function isPersonalLinkQuotaExhausted(professionalId: string): Promise<boolean> {
  const status = await getPersonalLinkQuotaStatus(professionalId)
  return status.exhausted
}

export type PersonalLinkQuotaStatus = { limit: number; used: number; remaining: number; exhausted: boolean }

/**
 * Estado da quota do ciclo atual — inclui "remaining" pela mesma fórmula
 * usada num upgrade de plano a meio do ciclo: remaining = max(0, novoLimite
 * - usadoNoCicloAtual). Como o consumo (leads abertos) nunca é reiniciado
 * num upgrade, e o ciclo (current_period_start/end) também não muda, isto
 * já dá o resultado certo automaticamente assim que professionals.plan
 * passa a 'pro' a meio do ciclo — não é preciso nenhuma lógica extra de
 * "transição" no momento do upgrade.
 */
export async function getPersonalLinkQuotaStatus(professionalId: string): Promise<PersonalLinkQuotaStatus> {
  const { data: prof } = await supabaseAdmin
    .from('professionals')
    .select('plan, trial_ends_at, current_period_start, current_period_end')
    .eq('id', professionalId)
    .maybeSingle()

  if (!prof) return { limit: 0, used: 0, remaining: 0, exhausted: true }

  // Trial ativo conta como Starter (10/ciclo) — ver lib/effective-plan.ts.
  const limit = PERSONAL_LINK_PLAN_LIMITS[getEffectivePlan(prof)] ?? 0
  if (limit <= 0) return { limit: 0, used: 0, remaining: 0, exhausted: true }

  const { start, end } = getCycleWindow(prof)
  const { count } = await supabaseAdmin
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('professional_id', professionalId)
    .eq('source', 'pessoal')
    .not('opened_at', 'is', null)
    .gte('opened_at', start.toISOString())
    .lt('opened_at', end.toISOString())

  const used = count ?? 0
  const remaining = Math.max(0, limit - used)
  return { limit, used, remaining, exhausted: used >= limit }
}
