import { supabaseAdmin } from '@/lib/supabase-admin'

// Limites de leads do link pessoal que podem ser ABERTOS por ciclo — nunca
// por leads recebidos. Um lead nunca deixa de ser criado; só a abertura
// (visualização completa) consome quota. Fonte de verdade da APLICAÇÃO da
// regra é a função SQL personal_link_plan_limit() (ver
// supabase/migration_marketplace_v3_atomic.sql); esta constante existe só
// para leituras informativas em JS (UI, notificações) — mantém os números
// sincronizados manualmente com a função SQL se algum dia mudarem.
export const PERSONAL_LINK_PLAN_LIMITS: Record<string, number> = {
  free: 0, // vê os pedidos na lista, mas nunca consegue abrir nenhum
  starter: 10,
  pro: 30,
}

export type SubscriptionPeriod = {
  current_period_start: string | null
  current_period_end: string | null
}

/**
 * Início/fim do ciclo atual: período de subscrição Stripe quando existir,
 * caso contrário mês calendário (UTC) — fallback claro só para contas sem
 * subscrição Stripe associada (ex: ativadas manualmente, como a do
 * fundador). Espelha personal_link_cycle_window() em SQL.
 */
export function getCycleWindow(prof: SubscriptionPeriod, referenceDate: Date = new Date()): { start: Date; end: Date } {
  if (prof.current_period_start && prof.current_period_end) {
    return { start: new Date(prof.current_period_start), end: new Date(prof.current_period_end) }
  }
  const start = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1, 0, 0, 0))
  const end = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() + 1, 1, 0, 0, 0))
  return { start, end }
}

/** @deprecated usa getCycleWindow(prof) — mantido só até todos os chamadores serem migrados. */
export function getCycleStart(referenceDate: Date = new Date()): Date {
  return new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1, 0, 0, 0))
}

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
    .select('plan, current_period_start, current_period_end')
    .eq('id', professionalId)
    .maybeSingle()

  if (!prof) return { limit: 0, used: 0, remaining: 0, exhausted: true }

  const limit = PERSONAL_LINK_PLAN_LIMITS[prof.plan ?? 'free'] ?? 0
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
