-- NÃO EXECUTAR EM PRODUÇÃO SEM AUTORIZAÇÃO FINAL — este ficheiro é preparado
-- localmente e só é aplicado à base de dados depois de aprovação explícita
-- (aplicação manual via Supabase Studio, como as restantes migrações).
--
-- Decisão de negócio aprovada: o trial de 7 dias passa a dar acesso
-- funcional equivalente ao plano Starter (nunca ao Pro). Isto NÃO altera a
-- coluna `plan` (continua 'free' durante o trial — nunca escrever 'starter'
-- artificialmente, para não perder a distinção entre trial e subscrição
-- real). Espelha exatamente lib/effective-plan.ts (getEffectivePlan):
--
--   pro                                      → pro
--   starter                                  → starter
--   inactive                                 → inactive (nunca conta como pago)
--   free/null + trial_ends_at no futuro      → starter (equivalente)
--   free/null + trial expirado ou sem trial  → free
--
-- Nova função effective_paid_plan(), usada pelas duas funções que decidem
-- acesso pago em tempo real (open_personal_lead e acquire_marketplace_lead).
-- personal_link_plan_limit() em si NÃO muda — continua a mapear só
-- 'starter'→10 e 'pro'→30 (senão 0); o que muda é o valor que passamos a dar-
-- lhe: o plano EFETIVO em vez do plano em bruto.

create or replace function effective_paid_plan(p_plan text, p_trial_ends_at timestamptz)
returns text
language sql
stable
as $$
  select case
    when p_plan = 'pro' then 'pro'
    when p_plan = 'starter' then 'starter'
    when p_plan = 'inactive' then 'inactive'
    when (p_plan is null or p_plan = 'free') and p_trial_ends_at is not null and p_trial_ends_at > now() then 'starter'
    else 'free'
  end;
$$;

-- ============================================================
-- open_personal_lead: idêntica ao original, só troca
-- personal_link_plan_limit(v_prof.plan) por
-- personal_link_plan_limit(effective_paid_plan(v_prof.plan, v_prof.trial_ends_at))
-- e passa a selecionar trial_ends_at.
-- ============================================================
create or replace function open_personal_lead(p_lead_id uuid, p_professional_id uuid)
returns jsonb
language plpgsql
as $$
declare
  v_prof   record;
  v_lead   record;
  v_limit  integer;
  v_cycle  record;
  v_count  integer;
begin
  select id, plan, trial_ends_at, current_period_start, current_period_end
    into v_prof
    from professionals
    where id = p_professional_id
    for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select id, professional_id, source, opened_at
    into v_lead
    from leads
    where id = p_lead_id
    for update;

  if not found or v_lead.professional_id is distinct from p_professional_id or v_lead.source = 'marketplace' then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_lead.opened_at is not null then
    return jsonb_build_object('ok', true, 'already_open', true);
  end if;

  -- CORRIGIDO: usa o plano efetivo (trial ativo conta como Starter) em vez
  -- do plano em bruto.
  v_limit := personal_link_plan_limit(effective_paid_plan(v_prof.plan, v_prof.trial_ends_at));
  if v_limit <= 0 then
    return jsonb_build_object('ok', false, 'error', 'plan');
  end if;

  select * into v_cycle from personal_link_cycle_window(v_prof.current_period_start, v_prof.current_period_end);

  select count(*) into v_count
    from leads
    where professional_id = p_professional_id
      and source = 'pessoal'
      and opened_at is not null
      and opened_at >= v_cycle.cycle_start
      and opened_at <  v_cycle.cycle_end;

  if v_count >= v_limit then
    return jsonb_build_object('ok', false, 'error', 'quota');
  end if;

  update leads set opened_at = now() where id = p_lead_id;

  return jsonb_build_object('ok', true, 'already_open', false);
end;
$$;

-- ============================================================
-- acquire_marketplace_lead: idêntica à versão já corrigida em
-- migration_marketplace_acquire_inactive_plan_fix.sql, só troca
-- personal_link_plan_limit(v_prof.plan) por
-- personal_link_plan_limit(effective_paid_plan(v_prof.plan, v_prof.trial_ends_at))
-- e passa a selecionar trial_ends_at, para o trial também poder adquirir
-- leads do marketplace (equivalente a Starter — ainda sujeito a ter
-- créditos, como qualquer Starter).
-- ============================================================
create or replace function acquire_marketplace_lead(
  p_lead_id         uuid,
  p_professional_id uuid,
  p_radius_km       numeric,
  p_prof_lat        numeric,
  p_prof_lng        numeric
)
returns jsonb
language plpgsql
as $$
declare
  v_lead        record;
  v_prof        record;
  v_specialties text[];
  v_dlat        double precision;
  v_dlng        double precision;
  v_lat1        double precision;
  v_lat2        double precision;
  v_h           double precision;
  v_distance    numeric;
begin
  select id, professional_id, specialty, lat, lng
    into v_lead
    from leads
    where id = p_lead_id and source = 'marketplace'
    for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_lead.professional_id is not null then
    return jsonb_build_object('ok', false, 'error', 'taken');
  end if;

  select id, plan, trial_ends_at, marketplace_credits, specialty, specialties
    into v_prof
    from professionals
    where id = p_professional_id
    for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- CORRIGIDO: usa o plano efetivo (trial ativo conta como Starter) em vez
  -- do plano em bruto.
  if personal_link_plan_limit(effective_paid_plan(v_prof.plan, v_prof.trial_ends_at)) <= 0 then
    return jsonb_build_object('ok', false, 'error', 'plan');
  end if;

  if coalesce(v_prof.marketplace_credits, 0) < 1 then
    return jsonb_build_object('ok', false, 'error', 'credits');
  end if;

  v_specialties := case
    when v_prof.specialties is not null and array_length(v_prof.specialties, 1) > 0 then v_prof.specialties
    when v_prof.specialty is not null then array[v_prof.specialty]
    else array[]::text[]
  end;

  if v_lead.specialty is null or not (v_lead.specialty = any(v_specialties)) then
    return jsonb_build_object('ok', false, 'error', 'specialty');
  end if;

  -- Raio aproximado — só recusa quando AMBOS os lados têm coordenadas; sem
  -- coordenadas de um dos lados usa-se o fallback já aplicado na listagem
  -- (correspondência por zona), nunca se perde um pedido só por falta de
  -- geocodificação. Fórmula de Haversine, igual à usada em lib/geo.ts.
  if v_lead.lat is not null and v_lead.lng is not null and p_prof_lat is not null and p_prof_lng is not null then
    v_dlat := radians(v_lead.lat - p_prof_lat);
    v_dlng := radians(v_lead.lng - p_prof_lng);
    v_lat1 := radians(p_prof_lat);
    v_lat2 := radians(v_lead.lat);
    v_h    := power(sin(v_dlat / 2), 2) + cos(v_lat1) * cos(v_lat2) * power(sin(v_dlng / 2), 2);
    v_distance := 6371 * 2 * asin(least(1.0, sqrt(v_h)));

    if v_distance > p_radius_km then
      return jsonb_build_object('ok', false, 'error', 'out_of_range');
    end if;
  end if;

  update professionals set marketplace_credits = marketplace_credits - 1 where id = p_professional_id;
  update leads set professional_id = p_professional_id, locked = false, status = 'novo' where id = p_lead_id;

  return jsonb_build_object('ok', true);
end;
$$;
