-- NÃO EXECUTAR EM PRODUÇÃO SEM AUTORIZAÇÃO FINAL — este ficheiro é preparado
-- localmente e só é aplicado à base de dados depois de aprovação explícita
-- (aplicação manual via Supabase Studio, como as restantes migrações).
--
-- Bug encontrado na auditoria de consistência técnica de planos/permissões:
-- a função acquire_marketplace_lead (migration_marketplace_v3_atomic.sql)
-- bloqueia a aquisição de leads do marketplace só quando
-- `v_prof.plan is null or v_prof.plan = 'free'`. Isto é uma lista de
-- exclusão, não de inclusão — um profissional cujo plano seja 'inactive'
-- (subscrição cancelada ou pagamento falhado, ver app/api/stripe/webhook)
-- não é 'free' nem null, por isso passa esta verificação sem ser bloqueado e
-- consegue continuar a adquirir leads pagos do marketplace mesmo sem
-- subscrição ativa.
--
-- A função irmã personal_link_plan_limit(), na mesma migração, já resolve
-- exatamente o mesmo problema corretamente (lista de inclusão: só 'starter'
-- e 'pro' devolvem um limite > 0; qualquer outro valor, incluindo 'inactive',
-- devolve 0). Esta correção substitui a verificação frágil por uma chamada a
-- essa mesma função, em vez de duplicar uma segunda lista — nenhuma regra
-- de negócio nova, só a aplicação consistente da já existente ("só planos
-- pagos podem adquirir leads do marketplace").
--
-- Corpo da função idêntico ao original, exceto a condição da linha
-- assinalada abaixo.

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

  select id, plan, marketplace_credits, specialty, specialties
    into v_prof
    from professionals
    where id = p_professional_id
    for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- CORRIGIDO: lista de inclusão via personal_link_plan_limit (só devolve
  -- > 0 para 'starter'/'pro') em vez de `v_prof.plan is null or v_prof.plan
  -- = 'free'`, que deixava passar qualquer outro valor (ex: 'inactive').
  if personal_link_plan_limit(v_prof.plan) <= 0 then
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
