-- Portfólio dos profissionais
create table if not exists professional_portfolio (
  id              uuid primary key default gen_random_uuid(),
  professional_id uuid references professionals(id) on delete cascade,
  url             text not null,
  type            text default 'image' check (type in ('image', 'video')),
  caption         text,
  sort_order      int default 0,
  created_at      timestamptz default now()
);

alter table professional_portfolio enable row level security;

create policy if not exists "portfolio_select_public"
  on professional_portfolio for select using (true);

create policy if not exists "portfolio_insert_own"
  on professional_portfolio for insert with check (
    professional_id in (select id from professionals where user_id = auth.uid())
  );

create policy if not exists "portfolio_delete_own"
  on professional_portfolio for delete using (
    professional_id in (select id from professionals where user_id = auth.uid())
  );

-- Foto de perfil
alter table professionals add column if not exists avatar_url text;

-- Reviews: permitir inserção pública (para página de avaliação futura)
create policy if not exists "reviews_insert_public"
  on reviews for insert with check (true);
