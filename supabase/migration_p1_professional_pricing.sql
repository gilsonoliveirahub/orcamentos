-- P1 (2026-09-18, revisto no mesmo dia para suportar subserviços): preços
-- por especialidade E por subserviço — um profissional com várias
-- especialidades ativas (`professionals.specialties`) passa a poder ter uma
-- configuração de preços própria por especialidade, e dentro da mesma
-- especialidade, preços diferentes por subserviço (ex: Pintura interior vs.
-- exterior vs. tetos vs. portas e aros; chão flutuante vs. remoção de
-- pavimento vs. rodapés). Ver lib/professional-pricing.ts para a lógica de
-- resolução (buildPricingIndex / resolveSpecialtyPricing /
-- resolveSubservicePricing / resolvePaintingAreaPrices).
--
-- NÃO EXECUTAR sem autorização explícita — este ficheiro é só para revisão.
--
-- Aditiva: cria tabela nova, não toca em `professionals` nem em nenhuma
-- linha existente. As colunas legacy em `professionals` (price_per_m2,
-- price_per_hour, travel_cost, min_quote, price_m2_walls, price_m2_ceiling,
-- price_m2_exterior, extra_dark_color, extra_cracks, extra_furniture_move,
-- extra_primer) ficam exatamente como estão, servindo de fallback de
-- compatibilidade para contas/subserviços que ainda não foram configurados
-- individualmente (ver resolveSpecialtyPricing/resolveSubservicePricing).
create table if not exists professional_pricing (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references professionals(id) on delete cascade,
  specialty text not null,
  -- '' = preço geral da especialidade (linha "toda a especialidade",
  -- equivalente ao que existia antes de haver subserviços). Um valor
  -- não-vazio identifica um subserviço do catálogo em
  -- lib/professional-pricing.ts (SPECIALTY_SUBSERVICES) — nunca texto livre
  -- vindo do cliente. Not null + default '' (não null) para a constraint
  -- unique abaixo funcionar: o Postgres trata múltiplos NULL como
  -- não-conflituosos numa UNIQUE, o que permitiria duas linhas "gerais" da
  -- mesma especialidade — '' evita esse buraco.
  subservico text not null default '',
  price_per_m2 numeric,
  price_per_hour numeric,
  -- Preço genérico por unidade/peça ou metro linear — usado por subserviços
  -- do tipo 'unit' (ex: portas e aros, rodapés), que não são nem m² nem
  -- hora. Estrutura nova, sem nenhum valor implícito.
  price_per_unit numeric,
  travel_cost numeric,
  min_quote numeric,
  price_m2_walls numeric,
  price_m2_ceiling numeric,
  price_m2_exterior numeric,
  extra_dark_color numeric,
  extra_cracks numeric,
  extra_furniture_move numeric,
  extra_primer numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (professional_id, specialty, subservico)
);

create index if not exists professional_pricing_professional_id_idx
  on professional_pricing(professional_id);

alter table professional_pricing enable row level security;

-- Mesma regra de posse já usada em `leads_select_own`/`quotes_select_own`
-- (supabase/schema.sql): o profissional só vê/edita as suas próprias linhas.
-- Nenhuma policy dá acesso a linhas de outro professional_id — confirmar
-- sempre com `select policyname, qual, with_check from pg_policies where
-- tablename = 'professional_pricing'` depois de aplicar, antes de confiar.
--
-- `CREATE POLICY IF NOT EXISTS` não existe em PostgreSQL (só CREATE
-- TABLE/INDEX suportam essa cláusula) — idempotência conseguida aqui com
-- `DROP POLICY IF EXISTS` antes de cada `CREATE POLICY`.
drop policy if exists "professional_pricing_select_own" on professional_pricing;
create policy "professional_pricing_select_own"
  on professional_pricing for select using (
    professional_id in (select id from professionals where user_id = auth.uid())
  );

drop policy if exists "professional_pricing_insert_own" on professional_pricing;
create policy "professional_pricing_insert_own"
  on professional_pricing for insert with check (
    professional_id in (select id from professionals where user_id = auth.uid())
  );

drop policy if exists "professional_pricing_update_own" on professional_pricing;
create policy "professional_pricing_update_own"
  on professional_pricing for update using (
    professional_id in (select id from professionals where user_id = auth.uid())
  );

comment on table professional_pricing is
  'Preços configurados pelo profissional, por especialidade e por subserviço (subservico=vazio = preço geral da especialidade). Sem linha para uma especialidade/subserviço = usar a linha geral, e sem essa, as colunas legacy em professionals (compatibilidade).';
