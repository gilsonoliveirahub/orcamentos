-- Grupo (2026-08-26) — permite gravar o valor final acordado de um trabalho
-- quando o lead é marcado como "Fechado", ligado diretamente ao lead_id (é a
-- própria linha). Não toca em `quotes` (estimativa original), `agreements`,
-- pagamentos, ranking/distribuição de leads nem no indicador "Faturado" —
-- nenhum desses lê esta coluna.
--
-- Nullable, sem default: o profissional pode escolher explicitamente
-- "Prefiro não indicar" (grava null) em vez de deixar por preencher sem
-- decisão — a obrigatoriedade da escolha é aplicada em
-- app/api/leads/status/route.ts, não pela base de dados.
--
-- NÃO APLICADO em produção — ficheiro só criado localmente, a aplicar
-- manualmente mais tarde (mesmo fluxo dos restantes migration_*.sql deste
-- repositório).

alter table leads add column if not exists valor_fechado numeric;

-- dashboard_leads() (definida em migration_marketplace_v3_atomic.sql) tem uma
-- lista explícita de colunas de saída — o ALTER TABLE acima, sozinho, NÃO
-- basta para a área Stats (app/stats/page.tsx) conseguir ler valor_fechado,
-- porque essa página lê sempre por esta RPC, nunca por select('*') direto.
-- Postgres não permite mudar as colunas de saída de uma função table-valued
-- com CREATE OR REPLACE — é preciso DROP + CREATE. Corpo idêntico ao
-- original, só com valor_fechado acrescentado a seguir a metadata; nenhuma
-- outra coluna, condição de autorização ou grant foi alterado.
drop function if exists dashboard_leads();

create function dashboard_leads()
returns table (
  id               uuid,
  status           text,
  source           text,
  locked           boolean,
  opened_at        timestamptz,
  created_at       timestamptz,
  updated_at       timestamptz,
  professional_id  uuid,
  zone_requested   text,
  specialty        text,
  q1_tipo_trabalho text,
  q2_divisoes      text,
  q3_area_m2       numeric,
  q4_cor_escura    boolean,
  q5_fissuras      boolean,
  q6_mobilias      boolean,
  q7_primer        boolean,
  q8_teto          boolean,
  q9_prazo         text,
  q10_orcamentos_anteriores boolean,
  name             text,
  phone            text,
  email            text,
  q12_notas        text,
  q11_fotos_url    text[],
  metadata         jsonb,
  valor_fechado    numeric
)
language sql
security definer
set search_path = public
as $$
  select
    l.id, l.status, l.source, l.locked, l.opened_at, l.created_at, l.updated_at, l.professional_id,
    l.zone_requested, l.specialty,
    l.q1_tipo_trabalho, l.q2_divisoes, l.q3_area_m2, l.q4_cor_escura, l.q5_fissuras,
    l.q6_mobilias, l.q7_primer, l.q8_teto, l.q9_prazo, l.q10_orcamentos_anteriores,
    case when lead_is_authorized(l.opened_at, l.source, l.locked) then l.name  else null end,
    case when lead_is_authorized(l.opened_at, l.source, l.locked) then l.phone else null end,
    case when lead_is_authorized(l.opened_at, l.source, l.locked) then l.email else null end,
    case when lead_is_authorized(l.opened_at, l.source, l.locked) then l.q12_notas     else null end,
    case when lead_is_authorized(l.opened_at, l.source, l.locked) then l.q11_fotos_url else null end,
    case when lead_is_authorized(l.opened_at, l.source, l.locked) then l.metadata
         else (l.metadata - 'notas' - 'media_urls')
    end,
    l.valor_fechado
  from leads l
  where l.professional_id in (select id from professionals where user_id = auth.uid());
$$;

grant execute on function dashboard_leads() to authenticated;
