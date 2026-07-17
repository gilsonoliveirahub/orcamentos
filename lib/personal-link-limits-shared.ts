// Constantes e cálculos puros, sem nenhuma dependência de supabaseAdmin —
// este ficheiro tem de poder ser importado com segurança por componentes
// cliente ('use client'), como app/dashboard/page.tsx. NUNCA importar
// @/lib/supabase-admin aqui: isso rebentaria o bundle do browser (a chave
// de service role nunca está disponível no cliente, e supabaseAdmin
// inicializa-se de forma eager no topo do módulo).

// Limites de leads do link pessoal que podem ser ABERTOS por ciclo — nunca
// por leads recebidos. Fonte de verdade da APLICAÇÃO da regra é a função
// SQL personal_link_plan_limit() (ver supabase/migration_marketplace_v3_atomic.sql);
// esta constante existe só para leituras informativas em JS (UI,
// notificações) — mantém os números sincronizados manualmente com a
// função SQL se algum dia mudarem.
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
