-- Sistema de métricas / analytics (painel admin + /stats)
-- NÃO EXECUTAR EM PRODUÇÃO SEM AUTORIZAÇÃO FINAL — este ficheiro é preparado
-- localmente e só é aplicado à base de dados depois de aprovação explícita.
--
-- Modelo:
--   analytics_events              — eventos individuais, retenção 90 dias
--   analytics_daily_summary       — contagens de eventos por dia/profissional/tipo/origem/canal, retenção 24 meses
--   analytics_daily_unique_visitors — total de visitantes únicos por dia, plataforma e por profissional
--                                     (tabela própria porque unique_visitors NUNCA pode ser somado entre
--                                     linhas de analytics_daily_summary sem contar a mesma pessoa 2x)
--
-- Nenhuma das três tabelas tem qualquer política RLS para anon/authenticated.
-- Todo o acesso é feito por rotas server-side com supabaseAdmin (service_role,
-- que ignora RLS por definição) e a própria rota aplica a autorização.

create table if not exists analytics_events (
  id                uuid primary key default gen_random_uuid(),
  event_type        text not null check (event_type in (
                       'page_view',
                       'quote_cta_click',
                       'request_started',
                       'request_completed',
                       'whatsapp_click',
                       'email_click'
                     )),
  professional_id   uuid references professionals(id) on delete set null,
  -- null = tráfego da plataforma não ligado a um profissional (home, /contactos,
  -- /pedir antes de haver atribuição, ou marketplace sem profissional disponível)
  visitor_hash      text not null,
  -- HMAC_SHA256(ANALYTICS_HASH_SECRET, data_do_dia + IP + User-Agent), calculado
  -- em memória no servidor. IP e User-Agent NUNCA são guardados nesta tabela.
  source            text check (source in ('pessoal', 'marketplace')),
  path              text not null,
  referrer_domain   text,
  utm_source        text,
  utm_medium        text,
  utm_campaign      text,
  origin_channel    text check (origin_channel in ('facebook', 'instagram', 'whatsapp', 'google', 'direto', 'outro')),
  created_at        timestamptz not null default now()
);

create index if not exists analytics_events_professional_created_idx
  on analytics_events (professional_id, created_at);
create index if not exists analytics_events_type_created_idx
  on analytics_events (event_type, created_at);
create index if not exists analytics_events_visitor_created_idx
  on analytics_events (visitor_hash, created_at);

alter table analytics_events enable row level security;
-- Sem políticas para anon/authenticated. Só service_role escreve/lê (bypassa RLS).

create table if not exists analytics_daily_summary (
  id                uuid primary key default gen_random_uuid(),
  day               date not null,
  professional_id   uuid references professionals(id) on delete set null,
  event_type        text not null,
  source            text check (source in ('pessoal', 'marketplace')),
  origin_channel    text check (origin_channel in ('facebook', 'instagram', 'whatsapp', 'google', 'direto', 'outro')),
  event_count       integer not null default 0,
  unique_visitors   integer not null default 0,
  -- Visitantes únicos DENTRO desta divisão específica (mesmo dia + mesmo
  -- profissional + mesmo tipo de evento + mesma origem + mesmo canal).
  -- NUNCA somar esta coluna entre linhas diferentes para obter um total —
  -- a mesma pessoa pode aparecer em várias linhas do mesmo dia. Para totais,
  -- usar sempre analytics_daily_unique_visitors.
  created_at        timestamptz not null default now()
);

-- Índice único com COALESCE porque professional_id/source/origin_channel podem
-- ser null — necessário para o DELETE+INSERT idempotente feito pela função de
-- agregação (equivalente a UPSERT, ver aggregate_analytics_day abaixo).
create unique index if not exists analytics_daily_summary_dedup on analytics_daily_summary (
  day,
  coalesce(professional_id, '00000000-0000-0000-0000-000000000000'),
  event_type,
  coalesce(source, ''),
  coalesce(origin_channel, '')
);
create index if not exists analytics_daily_summary_day_idx on analytics_daily_summary (day);
create index if not exists analytics_daily_summary_professional_idx on analytics_daily_summary (professional_id, day);

alter table analytics_daily_summary enable row level security;
-- Sem políticas para anon/authenticated.

create table if not exists analytics_daily_unique_visitors (
  id                uuid primary key default gen_random_uuid(),
  day               date not null,
  professional_id   uuid references professionals(id) on delete set null,
  -- null = total da plataforma inteira nesse dia (todos os profissionais e
  -- páginas gerais combinados, cada visitante contado uma única vez)
  unique_visitors   integer not null default 0,
  created_at        timestamptz not null default now()
);

create unique index if not exists analytics_daily_unique_visitors_dedup on analytics_daily_unique_visitors (
  day, coalesce(professional_id, '00000000-0000-0000-0000-000000000000')
);
create index if not exists analytics_daily_unique_visitors_day_idx on analytics_daily_unique_visitors (day);

alter table analytics_daily_unique_visitors enable row level security;
-- Sem políticas para anon/authenticated.

-- ────────────────────────────────────────────────────────────────────────
-- Funções de agregação — chamadas pelo cron diário (/api/cron/analytics)
-- Cada uma apaga o dia-alvo e reinsere a partir de analytics_events, o que
-- as torna idempotentes: correr duas vezes para o mesmo dia produz o mesmo
-- resultado, sem duplicar contagens. analytics_events nunca é alterada por
-- estas funções — só lida (SELECT).
-- ────────────────────────────────────────────────────────────────────────

create or replace function aggregate_analytics_day(target_day date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from analytics_daily_summary where day = target_day;

  insert into analytics_daily_summary (day, professional_id, event_type, source, origin_channel, event_count, unique_visitors)
  select
    target_day,
    professional_id,
    event_type,
    source,
    origin_channel,
    count(*) as event_count,
    count(distinct visitor_hash) as unique_visitors
  from analytics_events
  where created_at >= target_day::timestamptz
    and created_at < (target_day + 1)::timestamptz
  group by professional_id, event_type, source, origin_channel;
end;
$$;

create or replace function aggregate_analytics_unique_visitors_day(target_day date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from analytics_daily_unique_visitors where day = target_day;

  -- Total da plataforma (professional_id null) — cada visitor_hash contado 1x nesse dia
  insert into analytics_daily_unique_visitors (day, professional_id, unique_visitors)
  select target_day, null, count(distinct visitor_hash)
  from analytics_events
  where created_at >= target_day::timestamptz
    and created_at < (target_day + 1)::timestamptz;

  -- Total por profissional
  insert into analytics_daily_unique_visitors (day, professional_id, unique_visitors)
  select target_day, professional_id, count(distinct visitor_hash)
  from analytics_events
  where created_at >= target_day::timestamptz
    and created_at < (target_day + 1)::timestamptz
    and professional_id is not null
  group by professional_id;
end;
$$;

-- Nota sobre imutabilidade: analytics_events nunca é atualizada por código da
-- aplicação (sem rota de UPDATE). As duas funções acima fazem DELETE+INSERT
-- nas tabelas de agregados (não nos eventos), o que é o equivalente a um
-- UPSERT idempotente. Apagar eventos/agregados antigos é feito só pelo
-- processo de retenção em /api/cron/analytics (90 dias para analytics_events,
-- 24 meses para as duas tabelas de agregados), nunca por nenhuma rota pública.
