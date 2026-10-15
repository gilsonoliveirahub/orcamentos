-- FaçoPorTi — endpoint interno read-only site ops
-- Proposta LOCAL/staging. Não aplicar em produção sem aprovação explícita,
-- criação do JWT dedicado e validação de grants/RLS no Supabase alvo.
--
-- Objetivo: expor apenas JSON agregado para /api/internal/site-ops/summary.
-- Não concede SELECT direto a anon/authenticated nas tabelas privadas e não usa
-- service_role/admin key na aplicação. O servidor deve chamar esta RPC com um
-- JWT server-side cujo claim role = site_ops_readonly_server.

begin;

-- Papel mínimo para PostgREST/Supabase. Em Supabase gerido, a criação/atribuição
-- do segredo/JWT deve ser feita fora desta migration por operador autorizado.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'site_ops_readonly_server') then
    create role site_ops_readonly_server nologin;
  end if;
end
$$;

create or replace function public.site_ops_readonly_summary()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  with
  lead_rows as (
    select
      coalesce(nullif(btrim(status), ''), 'sem_valor') as status_key,
      coalesce(nullif(btrim(source), ''), 'sem_valor') as source_key,
      coalesce(nullif(btrim(specialty), ''), 'sem_valor') as specialty_key,
      coalesce(nullif(btrim(zone_requested), ''), 'sem_valor') as zone_key,
      coalesce(to_char(created_at, 'YYYY-MM'), 'sem_valor') as month_key,
      professional_id,
      coalesce(valor_fechado, 0) as closed_value
    from public.leads
  ),
  lead_totals as (
    select
      count(*)::integer as total,
      count(*) filter (where professional_id is not null)::integer as assigned_total,
      count(*) filter (where closed_value > 0)::integer as with_closed_value_total,
      coalesce(sum(closed_value) filter (where closed_value > 0), 0)::numeric as closed_value_sum
    from lead_rows
  ),
  lead_status as (select coalesce(jsonb_object_agg(status_key, total), '{}'::jsonb) value from (select status_key, count(*)::integer total from lead_rows group by status_key) s),
  lead_source as (select coalesce(jsonb_object_agg(source_key, total), '{}'::jsonb) value from (select source_key, count(*)::integer total from lead_rows group by source_key) s),
  lead_specialty as (select coalesce(jsonb_object_agg(specialty_key, total), '{}'::jsonb) value from (select specialty_key, count(*)::integer total from lead_rows group by specialty_key) s),
  lead_zone as (select coalesce(jsonb_object_agg(zone_key, total), '{}'::jsonb) value from (select zone_key, count(*)::integer total from lead_rows group by zone_key) s),
  lead_month as (select coalesce(jsonb_object_agg(month_key, total), '{}'::jsonb) value from (select month_key, count(*)::integer total from lead_rows group by month_key) s),

  professional_rows as (
    select
      active,
      coalesce(nullif(btrim(plan), ''), 'sem_valor') as plan_key,
      coalesce(nullif(btrim(zone), ''), 'sem_valor') as zone_key,
      coalesce(to_char(created_at, 'YYYY-MM'), 'sem_valor') as month_key,
      trial_ends_at
    from public.professionals
  ),
  professional_specialty_rows as (
    select coalesce(nullif(btrim(specialty_value), ''), 'sem_valor') as specialty_key
    from public.professionals p
    cross join lateral unnest(
      case
        when cardinality(coalesce(p.specialties, '{}'::text[])) > 0 then p.specialties
        else array[p.specialty]
      end
    ) specialty_value
  ),
  professional_totals as (
    select
      count(*)::integer as total,
      count(*) filter (where active is true)::integer as active_total,
      count(*) filter (where active is not true)::integer as inactive_total,
      count(*) filter (where trial_ends_at >= now() and trial_ends_at <= now() + interval '7 days')::integer as trial_ending_soon_total
    from professional_rows
  ),
  professional_plan as (select coalesce(jsonb_object_agg(plan_key, total), '{}'::jsonb) value from (select plan_key, count(*)::integer total from professional_rows group by plan_key) s),
  professional_specialty as (select coalesce(jsonb_object_agg(specialty_key, total), '{}'::jsonb) value from (select specialty_key, count(*)::integer total from professional_specialty_rows group by specialty_key) s),
  professional_zone as (select coalesce(jsonb_object_agg(zone_key, total), '{}'::jsonb) value from (select zone_key, count(*)::integer total from professional_rows group by zone_key) s),
  professional_month as (select coalesce(jsonb_object_agg(month_key, total), '{}'::jsonb) value from (select month_key, count(*)::integer total from professional_rows group by month_key) s),

  analytics_rows as (
    select
      day,
      coalesce(nullif(btrim(event_type), ''), 'sem_valor') as event_type_key,
      coalesce(nullif(btrim(origin_channel), ''), 'sem_valor') as origin_channel_key,
      coalesce(nullif(btrim(source), ''), 'sem_valor') as source_key,
      coalesce(event_count, 0)::integer as event_count
    from public.analytics_daily_summary
  ),
  analytics_totals as (
    select coalesce(sum(event_count), 0)::integer as events_total
    from analytics_rows
  ),
  analytics_unique as (
    -- A tabela tem total da plataforma (professional_id null) e totais por profissional.
    -- Somar ambos duplica visitantes; para ops global usa-se só a linha plataforma.
    select coalesce(sum(unique_visitors) filter (where professional_id is null), 0)::integer as unique_visitors_daily_sum
    from public.analytics_daily_unique_visitors
  ),
  analytics_event_type as (select coalesce(jsonb_object_agg(event_type_key, total), '{}'::jsonb) value from (select event_type_key, sum(event_count)::integer total from analytics_rows group by event_type_key) s),
  analytics_origin as (select coalesce(jsonb_object_agg(origin_channel_key, total), '{}'::jsonb) value from (select origin_channel_key, sum(event_count)::integer total from analytics_rows group by origin_channel_key) s),
  analytics_source as (select coalesce(jsonb_object_agg(source_key, total), '{}'::jsonb) value from (select source_key, sum(event_count)::integer total from analytics_rows group by source_key) s),
  analytics_day as (select coalesce(jsonb_object_agg(day::text, total), '{}'::jsonb) value from (select day, sum(event_count)::integer total from analytics_rows group by day) s)
  select jsonb_build_object(
    'generated_at', now(),
    'leads', jsonb_build_object(
      'total', lt.total,
      'assigned_total', lt.assigned_total,
      'with_closed_value_total', lt.with_closed_value_total,
      'closed_value_sum', lt.closed_value_sum,
      'by_status', ls.value,
      'by_source', lso.value,
      'by_specialty', lsp.value,
      'by_zone_requested', lz.value,
      'by_month', lm.value
    ),
    'professionals', jsonb_build_object(
      'total', pt.total,
      'active_total', pt.active_total,
      'inactive_total', pt.inactive_total,
      'trial_ending_soon_total', pt.trial_ending_soon_total,
      'by_plan', pp.value,
      'by_specialty', ps.value,
      'by_zone', pz.value,
      'by_month', pm.value
    ),
    'analytics', jsonb_build_object(
      'events_total', at.events_total,
      'unique_visitors_daily_sum', au.unique_visitors_daily_sum,
      'by_event_type', aet.value,
      'by_origin_channel', ao.value,
      'by_source', aso.value,
      'by_day', ad.value
    )
  )
  into result
  from lead_totals lt, lead_status ls, lead_source lso, lead_specialty lsp, lead_zone lz, lead_month lm,
       professional_totals pt, professional_plan pp, professional_specialty ps, professional_zone pz, professional_month pm,
       analytics_totals at, analytics_unique au, analytics_event_type aet, analytics_origin ao, analytics_source aso, analytics_day ad;

  return result;
exception
  when insufficient_privilege then
    raise;
  when undefined_table or undefined_column then
    raise;
end;
$$;

comment on function public.site_ops_readonly_summary() is
  'Resumo agregado read-only para endpoint interno site ops. Retorna apenas contagens/somas por dimensão; sem PII/ids; agrega DB-side todas as linhas para evitar paginação/truncamento.';

revoke all on function public.site_ops_readonly_summary() from public;
revoke all on function public.site_ops_readonly_summary() from anon;
revoke all on function public.site_ops_readonly_summary() from authenticated;

-- Permissões mínimas para chamar a RPC via PostgREST: USAGE no schema público
-- e EXECUTE nesta função. Não concede SELECT direto nas tabelas.
grant usage on schema public to site_ops_readonly_server;
grant execute on function public.site_ops_readonly_summary() to site_ops_readonly_server;

-- Necessário para PostgREST/Supabase aceitar JWT com claim role =
-- site_ops_readonly_server. Não concede SELECT direto nas tabelas.
grant site_ops_readonly_server to authenticator;

-- Esta migration não concede SELECT direto a anon/authenticated em leads,
-- professionals, analytics_daily_summary ou analytics_daily_unique_visitors.
-- RLS/policies existentes do produto devem ser auditadas no alvo antes de aplicar.

-- Liga diretamente via Postgres (shared pooler), não via PostgREST/API Keys
-- (secret_jwt_template exige plano Pro). Só o FLAG de login fica aqui — a
-- password em si é definida à parte, fora de controlo de versão, nunca
-- escrita neste ficheiro nem em nenhum outro ficheiro do repositório.
alter role site_ops_readonly_server login;

commit;
