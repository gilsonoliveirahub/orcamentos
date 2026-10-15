-- FaçoPorTi — teste off-production da RPC read-only site ops
-- Usar apenas em Supabase local isolado ou projeto staging separado. NÃO usar em produção.
-- Pré-requisito: supabase/migration_site_ops_readonly_summary.sql já aplicada no alvo.
-- O script insere dados sintéticos dentro de uma transação e termina com ROLLBACK.

begin;

-- Garante que o teste falha cedo se a migration/RPC ainda não existir.
select public.site_ops_readonly_summary();

do $$
declare
  prof_pintura uuid := gen_random_uuid();
  prof_pladur uuid := gen_random_uuid();
  baseline jsonb;
  after_fixture jsonb;
  expected_leads_total integer;
  expected_assigned_total integer;
  expected_closed_total integer;
  expected_closed_sum numeric;
  expected_professionals_total integer;
  expected_active_total integer;
  expected_inactive_total integer;
  expected_trial_total integer;
  expected_events_total integer;
  expected_unique_total integer;
begin
  baseline := public.site_ops_readonly_summary();

  insert into public.professionals (
    id, name, specialty, specialties, phone, zone, slug, active, plan, trial_ends_at, created_at, updated_at
  ) values
    (
      prof_pintura,
      'Teste Readonly Pintura',
      'Pintura Teste Readonly',
      array['Pintura Teste Readonly'],
      '+351000000001',
      'Porto Teste Readonly',
      'teste-readonly-pintura-' || replace(prof_pintura::text, '-', ''),
      true,
      'pro',
      now() + interval '3 days',
      timestamptz '2026-10-01 10:00:00+00',
      now()
    ),
    (
      prof_pladur,
      'Teste Readonly Pladur',
      'Pladur Teste Readonly',
      array['Pladur Teste Readonly', 'Canalização Teste Readonly'],
      '+351000000002',
      'Lisboa Teste Readonly',
      'teste-readonly-pladur-' || replace(prof_pladur::text, '-', ''),
      false,
      'inactive',
      now() + interval '30 days',
      timestamptz '2026-09-15 10:00:00+00',
      now()
    );

  insert into public.leads (
    name, phone, status, specialty, source, zone_requested, professional_id, valor_fechado, created_at, updated_at
  ) values
    (
      'Cliente Sintético A',
      '+351000000101',
      'novo',
      'Pintura Teste Readonly',
      'marketplace',
      'Porto Teste Readonly',
      prof_pintura,
      125,
      timestamptz '2026-10-02 10:00:00+00',
      now()
    ),
    (
      'Cliente Sintético B',
      '+351000000102',
      'fechado',
      'Pintura Teste Readonly',
      'marketplace',
      'Porto Teste Readonly',
      prof_pintura,
      250,
      timestamptz '2026-10-03 10:00:00+00',
      now()
    ),
    (
      'Cliente Sintético C',
      '+351000000103',
      'fechado',
      'Canalização Teste Readonly',
      'pessoal',
      'Lisboa Teste Readonly',
      null,
      0,
      timestamptz '2026-09-20 10:00:00+00',
      now()
    );

  insert into public.analytics_daily_summary (
    day, professional_id, event_type, source, origin_channel, event_count, unique_visitors
  ) values
    (date '2026-10-06', prof_pintura, 'profile_view_teste_readonly', 'marketplace', 'google', 3, 3),
    (date '2026-10-06', prof_pintura, 'request_started_teste_readonly', 'marketplace', 'direto', 2, 1);

  insert into public.analytics_daily_unique_visitors (day, professional_id, unique_visitors) values
    (date '2026-10-06', null, 4),
    (date '2026-10-06', prof_pintura, 3);

  after_fixture := public.site_ops_readonly_summary();

  expected_leads_total := (baseline #>> '{leads,total}')::integer + 3;
  expected_assigned_total := (baseline #>> '{leads,assigned_total}')::integer + 2;
  expected_closed_total := (baseline #>> '{leads,with_closed_value_total}')::integer + 2;
  expected_closed_sum := (baseline #>> '{leads,closed_value_sum}')::numeric + 375;
  expected_professionals_total := (baseline #>> '{professionals,total}')::integer + 2;
  expected_active_total := (baseline #>> '{professionals,active_total}')::integer + 1;
  expected_inactive_total := (baseline #>> '{professionals,inactive_total}')::integer + 1;
  expected_trial_total := (baseline #>> '{professionals,trial_ending_soon_total}')::integer + 1;
  expected_events_total := (baseline #>> '{analytics,events_total}')::integer + 5;
  expected_unique_total := (baseline #>> '{analytics,unique_visitors_daily_sum}')::integer + 4;

  if (after_fixture #>> '{leads,total}')::integer <> expected_leads_total then
    raise exception 'leads.total esperado %, obtido %', expected_leads_total, after_fixture #>> '{leads,total}';
  end if;
  if (after_fixture #>> '{leads,assigned_total}')::integer <> expected_assigned_total then
    raise exception 'leads.assigned_total esperado %, obtido %', expected_assigned_total, after_fixture #>> '{leads,assigned_total}';
  end if;
  if (after_fixture #>> '{leads,with_closed_value_total}')::integer <> expected_closed_total then
    raise exception 'leads.with_closed_value_total esperado %, obtido %', expected_closed_total, after_fixture #>> '{leads,with_closed_value_total}';
  end if;
  if (after_fixture #>> '{leads,closed_value_sum}')::numeric <> expected_closed_sum then
    raise exception 'leads.closed_value_sum esperado %, obtido %', expected_closed_sum, after_fixture #>> '{leads,closed_value_sum}';
  end if;
  if (after_fixture #>> '{professionals,total}')::integer <> expected_professionals_total then
    raise exception 'professionals.total esperado %, obtido %', expected_professionals_total, after_fixture #>> '{professionals,total}';
  end if;
  if (after_fixture #>> '{professionals,active_total}')::integer <> expected_active_total then
    raise exception 'professionals.active_total esperado %, obtido %', expected_active_total, after_fixture #>> '{professionals,active_total}';
  end if;
  if (after_fixture #>> '{professionals,inactive_total}')::integer <> expected_inactive_total then
    raise exception 'professionals.inactive_total esperado %, obtido %', expected_inactive_total, after_fixture #>> '{professionals,inactive_total}';
  end if;
  if (after_fixture #>> '{professionals,trial_ending_soon_total}')::integer <> expected_trial_total then
    raise exception 'professionals.trial_ending_soon_total esperado %, obtido %', expected_trial_total, after_fixture #>> '{professionals,trial_ending_soon_total}';
  end if;
  if (after_fixture #>> '{analytics,events_total}')::integer <> expected_events_total then
    raise exception 'analytics.events_total esperado %, obtido %', expected_events_total, after_fixture #>> '{analytics,events_total}';
  end if;
  if (after_fixture #>> '{analytics,unique_visitors_daily_sum}')::integer <> expected_unique_total then
    raise exception 'analytics.unique_visitors_daily_sum esperado %, obtido %', expected_unique_total, after_fixture #>> '{analytics,unique_visitors_daily_sum}';
  end if;

  if coalesce((after_fixture #>> '{leads,by_status,novo}')::integer, 0) < coalesce((baseline #>> '{leads,by_status,novo}')::integer, 0) + 1 then
    raise exception 'leads.by_status.novo não incrementou como esperado';
  end if;
  if coalesce((after_fixture #>> '{analytics,by_event_type,profile_view_teste_readonly}')::integer, 0) < 3 then
    raise exception 'analytics.by_event_type.profile_view_teste_readonly esperado >= 3';
  end if;

  raise notice 'OK: fixture sintética validou a RPC site_ops_readonly_summary sem persistir dados.';
end
$$;

-- Validação de permissões mínimas. Estes SELECTs devem produzir:
-- anon_can_execute=false, authenticated_can_execute=false, dedicated_can_execute=true.
select
  has_function_privilege('anon', 'public.site_ops_readonly_summary()', 'execute') as anon_can_execute,
  has_function_privilege('authenticated', 'public.site_ops_readonly_summary()', 'execute') as authenticated_can_execute,
  has_function_privilege('site_ops_readonly_server', 'public.site_ops_readonly_summary()', 'execute') as dedicated_can_execute,
  has_schema_privilege('site_ops_readonly_server', 'public', 'usage') as dedicated_has_public_usage;

rollback;
