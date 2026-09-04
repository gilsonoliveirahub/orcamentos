-- ============================================================
-- FaçoPorTi — Schema completo
-- Corre no Supabase SQL Editor
--
-- NOTA (2026-09-04): este ficheiro é o bootstrap original + reconciliação
-- de divergências confirmadas (ver auditoria 2026-08-25). NÃO reflete todas
-- as colunas/funções/tabelas dos restantes supabase/migration_*.sql — cada
-- um documenta a sua própria alteração e estado de aplicação. O comentário
-- "NÃO APLICADO em produção" dentro de alguns desses ficheiros pode estar
-- desatualizado (confirmado pelo menos um caso: migration_reviews_quotes_
-- leads_rls_lockdown.sql dizia isso mas já estava aplicado) — antes de
-- assumir o estado de qualquer migração, confirmar diretamente no Supabase
-- Studio de produção, não confiar só no comentário do ficheiro.
-- ============================================================

-- ── Tabela de Profissionais ───────────────────────────────────────────────────
create table if not exists professionals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  name        text not null,
  specialty   text default 'Pintura',
  -- Múltiplas especialidades por conta (implementado 2026-05-09, confirmado em
  -- produção 2026-07-14): `specialty` fica como legacy/fallback singular,
  -- `specialties` é a fonte usada quando tem pelo menos 1 elemento.
  specialties text[] default '{}',
  phone       text,
  zone        text,
  slug        text unique,
  bio         text,
  active      boolean default true,
  -- Preços base (Pintura — mantidos para compatibilidade)
  price_m2_walls      numeric default 4.00,
  price_m2_ceiling    numeric default 5.00,
  price_m2_exterior   numeric default 6.00,
  -- Extras (Pintura)
  extra_dark_color    numeric default 1.25,
  extra_cracks        numeric default 6.00,
  extra_furniture_move numeric default 50.00,
  extra_primer        numeric default 2.00,
  min_quote           numeric default 150.00,
  -- Subscrição — 'starter' e 'inactive' fazem parte do modelo de negócio real
  -- (ver app/api/stripe/webhook/route.ts) desde sempre; este check só
  -- listava 'free'/'pro' e nunca foi corrigido aqui, apesar de a constraint
  -- em produção já ter sido alterada para aceitar os 4 valores (divergência
  -- de versionamento confirmada em auditoria 2026-08-25, corrigida aqui).
  plan                text default 'free' check (plan in ('free', 'starter', 'pro', 'inactive')),
  trial_ends_at       timestamptz,
  -- Timestamps
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ── Tabela de Clientes ────────────────────────────────────────────────────────
create table if not exists clients (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  name        text not null,
  email       text,
  phone       text,
  created_at  timestamptz default now()
);

-- ── Tabela de Leads ───────────────────────────────────────────────────────────
create table if not exists leads (
  id          uuid primary key default gen_random_uuid(),
  name        text,
  phone       text not null,
  status      text default 'novo' check (status in ('novo', 'qualificado', 'visita', 'proposta', 'fechado', 'perdido')),
  -- Campos legacy (Pintura — mantidos para compatibilidade)
  q1_tipo_trabalho    text,
  q2_divisoes         text,
  q3_area_m2          numeric,
  q4_cor_escura       boolean,
  q5_fissuras         boolean,
  q6_mobilias         boolean,
  q7_primer           boolean,
  q8_teto             boolean,
  q9_prazo            text,
  q10_orcamentos_anteriores boolean,
  q11_fotos_url       text[],
  q12_notas           text,
  -- Campo genérico para qualquer profissão
  metadata            jsonb default '{}',
  -- Meta
  current_question    int default 1,
  professional_id     uuid references professionals(id),
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- ── Tabela de Orçamentos ──────────────────────────────────────────────────────
create table if not exists quotes (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid references leads(id) on delete cascade,
  professional_id uuid references professionals(id),
  -- Cálculo
  area_m2         numeric,
  valor_base      numeric,
  extras_total    numeric,
  valor_final     numeric,
  valor_min       numeric,
  valor_max       numeric,
  -- Texto gerado
  proposal_text   text,
  -- Follow-up
  sent_at                 timestamptz,
  followup_d2_sent        boolean default false,
  followup_d5_sent        boolean default false,
  -- Estado
  status  text default 'rascunho' check (status in ('rascunho', 'enviado', 'aceite', 'recusado')),
  created_at  timestamptz default now()
);

-- ── Tabela de Avaliações ──────────────────────────────────────────────────────
create table if not exists reviews (
  id              uuid primary key default gen_random_uuid(),
  professional_id uuid references professionals(id) on delete cascade,
  lead_id         uuid references leads(id) on delete set null,
  client_name     text,
  rating          int check (rating between 1 and 5),
  comment         text,
  created_at      timestamptz default now()
);

-- ── Migrações (aplica se tabelas já existem) ──────────────────────────────────
-- Corre estas linhas se a DB já estava criada sem estes campos:

alter table professionals add column if not exists user_id     uuid references auth.users(id) on delete cascade;
alter table professionals add column if not exists zone        text;
alter table professionals add column if not exists slug        text unique;
alter table professionals add column if not exists bio         text;
alter table professionals add column if not exists active      boolean default true;
alter table professionals add column if not exists plan        text default 'free';
alter table professionals add column if not exists trial_ends_at timestamptz;
alter table professionals add column if not exists updated_at  timestamptz default now();
alter table professionals add column if not exists stripe_customer_id     text;
alter table professionals add column if not exists stripe_subscription_id text;
alter table professionals add column if not exists marketplace_credits    integer default 0;
alter table professionals add column if not exists specialties            text[] default '{}';

-- 'starter'/'inactive' já são valores reais em produção (ver comentário na
-- definição da coluna acima) — recriar a constraint em bases criadas antes
-- desta correção. O nome por omissão do Postgres para um CHECK definido
-- inline na coluna (sem nome explícito) é "professionals_plan_check".
alter table professionals drop constraint if exists professionals_plan_check;
alter table professionals add constraint professionals_plan_check check (plan in ('free', 'starter', 'pro', 'inactive'));

alter table leads add column if not exists metadata jsonb default '{}';

-- ── Índices ───────────────────────────────────────────────────────────────────
create index if not exists leads_phone_idx          on leads(phone);
create index if not exists leads_status_idx         on leads(status);
create index if not exists leads_professional_idx   on leads(professional_id);
create index if not exists leads_metadata_idx       on leads using gin(metadata);
create index if not exists quotes_lead_id_idx       on quotes(lead_id);
create index if not exists professionals_slug_idx   on professionals(slug);
create index if not exists professionals_user_idx   on professionals(user_id);
create index if not exists professionals_specialty_idx on professionals(specialty);
create index if not exists clients_user_idx         on clients(user_id);

-- ── RLS (Row Level Security) ──────────────────────────────────────────────────
alter table professionals enable row level security;
alter table leads          enable row level security;
alter table quotes         enable row level security;
alter table clients        enable row level security;
alter table reviews        enable row level security;

-- Profissionais: vê o próprio perfil + todos os ativos (para marketplace)
create policy if not exists "professionals_select_active"
  on professionals for select using (active = true or auth.uid() = user_id);

create policy if not exists "professionals_update_own"
  on professionals for update using (auth.uid() = user_id);

create policy if not exists "professionals_insert_own"
  on professionals for insert with check (auth.uid() = user_id);

-- Leads: profissional vê os seus leads; qualquer pessoa pode inserir
create policy if not exists "leads_insert_public"
  on leads for insert with check (true);

create policy if not exists "leads_select_own"
  on leads for select using (
    professional_id in (
      select id from professionals where user_id = auth.uid()
    )
  );

create policy if not exists "leads_update_own"
  on leads for update using (
    professional_id in (
      select id from professionals where user_id = auth.uid()
    )
  );

-- Quotes: mesmo padrão que leads
create policy if not exists "quotes_insert_public"
  on quotes for insert with check (true);

create policy if not exists "quotes_select_own"
  on quotes for select using (
    professional_id in (
      select id from professionals where user_id = auth.uid()
    )
  );

-- Clients: vê o próprio registo
create policy if not exists "clients_select_own"
  on clients for select using (auth.uid() = user_id);

create policy if not exists "clients_insert_own"
  on clients for insert with check (auth.uid() = user_id);

-- Reviews: qualquer um lê; só inserção via API
create policy if not exists "reviews_select_all"
  on reviews for select using (true);
