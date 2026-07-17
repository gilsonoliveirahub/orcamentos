-- Marketplace v3 — aquisição/abertura verdadeiramente atómicas (transação
-- única no Postgres, nunca "descontar → atribuir → reembolsar" a partir da
-- aplicação), ciclo de quota alinhado com o período de subscrição Stripe, e
-- bloqueio de dados pessoais ao nível da base de dados (não só na UI).
--
-- Aplicado em produção (projeto facoporti) em 2026-07-17.
--
-- Não altera nem redistribui nenhum lead existente — só acrescenta colunas
-- (nullable) e funções; os REVOKE no fim não apagam dados, só impedem o
-- cliente autenticado de os ler diretamente.

-- ── Período de subscrição (para o ciclo de quota do link pessoal) ──────────
-- Gravado pelo webhook do Stripe na criação e em cada renovação. Contas
-- ativadas manualmente (sem subscrição Stripe, ex: a conta do fundador)
-- ficam com estes dois campos null para sempre — nesse caso as funções
-- abaixo caem para o fallback de mês calendário (ver personal_link_cycle_window).
alter table professionals add column if not exists current_period_start timestamptz;
alter table professionals add column if not exists current_period_end   timestamptz;

-- ============================================================
-- Limite de plano e janela do ciclo — fonte única de verdade para a
-- quota de leads do link pessoal, partilhada por open_personal_lead()
-- (aplicação real) e pelas leituras informativas feitas em JS.
-- Espelhar qualquer alteração aqui em lib/personal-link-limits.ts.
-- ============================================================
create or replace function personal_link_plan_limit(p_plan text)
returns integer
language sql
immutable
as $$
  select case p_plan
    when 'starter' then 10
    when 'pro'     then 30
    else 0 -- free e qualquer outro estado (ex: inactive) nunca abrem
  end;
$$;

-- Início/fim do ciclo atual: período de subscrição Stripe quando existir,
-- caso contrário mês calendário (UTC) — fallback claro só para contas sem
-- subscrição Stripe associada (ex: ativadas manualmente).
create or replace function personal_link_cycle_window(
  p_current_period_start timestamptz,
  p_current_period_end   timestamptz,
  p_reference            timestamptz default now()
)
returns table(cycle_start timestamptz, cycle_end timestamptz)
language sql
stable
as $$
  select
    coalesce(p_current_period_start, date_trunc('month', p_reference)),
    coalesce(p_current_period_end,   date_trunc('month', p_reference) + interval '1 month');
$$;

-- ============================================================
-- Abertura atómica de um lead do link pessoal.
--
-- Tudo dentro de uma única transação implícita da função:
--   1. Bloqueia a linha do profissional (FOR UPDATE) — serializa qualquer
--      tentativa concorrente de abertura pelo MESMO profissional, incluindo
--      a abertura simultânea de dois leads diferentes disputando a última
--      vaga da quota (o count de usados só é lido depois de já se deter
--      este bloqueio, por isso nunca vê um valor desatualizado).
--   2. Bloqueia a linha do lead (FOR UPDATE) e confirma que pertence ao
--      profissional e que é do link pessoal.
--   3. Se já estava aberto, devolve sucesso idempotente (duplo clique).
--   4. Confirma plano + quota do ciclo (janela do período de subscrição,
--      com fallback de mês calendário) — só depois marca opened_at.
-- Ou conclui tudo, ou não altera nada — sem lógica de reembolso, porque
-- nunca chega a gastar nada antes de confirmar que pode.
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
  select id, plan, current_period_start, current_period_end
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

  v_limit := personal_link_plan_limit(v_prof.plan);
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
-- Aquisição atómica de uma oportunidade do marketplace.
--
-- Bloqueia o lead primeiro (falha rápido, sem tocar em créditos, se já foi
-- levado por outro profissional), só depois bloqueia e valida o profissional
-- (plano, crédito, especialidade, raio — tudo confirmado aqui, no servidor,
-- nunca confiado a partir do que a listagem já filtrou). Desconta o crédito
-- e associa o lead na mesma transação: ou os dois acontecem, ou nenhum.
-- Se dois profissionais disputarem o mesmo lead em simultâneo, o segundo
-- fica bloqueado no FOR UPDATE do lead até o primeiro terminar, vê
-- professional_id já preenchido e sai em 'taken' sem nunca chegar a
-- descontar crédito — não há reembolso porque nunca há cobrança indevida.
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

  select id, plan, marketplace_credits, specialty, specialties
    into v_prof
    from professionals
    where id = p_professional_id
    for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_prof.plan is null or v_prof.plan = 'free' then
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

-- Só o serviço (service_role, via supabaseAdmin) pode chamar estas duas
-- funções — ambas recebem p_professional_id como parâmetro em vez de o
-- derivarem de auth.uid(), por isso NUNCA podem ficar executáveis pelo
-- cliente autenticado: permitiria a um profissional abrir/adquirir leads
-- de outro, só por passar o id alheio.
revoke all on function open_personal_lead(uuid, uuid) from public, authenticated, anon;
revoke all on function acquire_marketplace_lead(uuid, uuid, numeric, numeric, numeric) from public, authenticated, anon;

-- ============================================================
-- Proteção de dados pessoais ao nível da base de dados.
--
-- Um lead "autorizado" é um lead cujos dados de contacto já podem ser
-- revelados: já foi aberto (link pessoal, consumiu quota) ou já foi
-- adquirido no marketplace (professional_id preenchido e locked=false —
-- cobre tanto a aquisição nova do pool como o desbloqueio antigo por
-- crédito em /api/leads/unlock). Antes disso, nome/telefone/email/notas/
-- fotos nunca podem sair da base de dados para o cliente autenticado —
-- nem por engano (select '*'), nem por acesso direto ao Supabase.
-- ============================================================
create or replace function lead_is_authorized(p_opened_at timestamptz, p_source text, p_locked boolean)
returns boolean
language sql
immutable
as $$
  select p_opened_at is not null or (p_source = 'marketplace' and coalesce(p_locked, false) = false);
$$;

-- Bloqueia o acesso direto do cliente autenticado a um lead ainda não
-- autorizado — ao nível da LINHA, não da coluna: nesta base de dados o
-- papel "authenticated" já tem SELECT ao nível da tabela em leads (grant
-- pré-existente), que se sobrepõe sempre a um REVOKE de coluna em
-- Postgres — um REVOKE de coluna aqui seria inofensivo mas inútil. A
-- política "Professional reads own leads" já existente é reescrita para
-- também exigir lead_is_authorized(...): antes da abertura autorizada a
-- LINHA fica invisível para o profissional dono, mesmo por acesso direto
-- ao Supabase — nunca só os campos, a linha toda. Não afeta "Admin reads
-- all leads" nem "Client reads own leads by phone" (políticas separadas,
-- sem esta condição — o admin e o próprio cliente continuam a ver tudo).
-- dashboard_leads() (abaixo) é security definer e não passa por RLS, por
-- isso continua a mostrar o resumo de TODOS os leads do profissional,
-- autorizados ou não, exatamente como pretendido.
drop policy if exists "Professional reads own leads" on leads;
create policy "Professional reads own leads"
  on leads for select
  using (
    professional_id in (select id from professionals where user_id = auth.uid())
    and lead_is_authorized(opened_at, source, locked)
  );

-- Função "gateway" para o dashboard: devolve sempre o resumo (estado,
-- origem, especialidade, datas, características do trabalho — nunca dados
-- de identificação do cliente), e só inclui nome/telefone/email/notas/
-- fotos/metadata completo quando o lead já está autorizado. security
-- definer para ter acesso às colunas revogadas acima, mas o filtro de
-- dono (auth.uid()) é escrito à mão aqui dentro — nunca confia em RLS
-- ambiente, porque RLS não se aplica a um dono de função com bypassrls.
create or replace function dashboard_leads()
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
  metadata         jsonb
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
    end
  from leads l
  where l.professional_id in (select id from professionals where user_id = auth.uid());
$$;

grant execute on function dashboard_leads() to authenticated;
