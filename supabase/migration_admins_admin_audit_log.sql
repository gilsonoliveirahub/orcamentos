-- Versiona `admins` e `admin_audit_log` — item 4 da auditoria de 2026-08-25.
-- As duas tabelas já existem e estão em uso em produção (criadas manualmente
-- no Supabase, nunca tiveram CREATE TABLE no repositório). Este ficheiro NÃO
-- precisa (nem deve) de ser aplicado a produção — é só documentação fiel da
-- estrutura real, para eliminar a divergência de versionamento. Os `if not
-- exists`/`if exists` abaixo tornam-no inofensivo (no-op) se algum dia for
-- corrido por engano numa base que já tenha estas tabelas.
--
-- Estrutura confirmada pelo Gilson via Supabase Studio (projeto
-- alnoeoexbkexifpxffpt), 2026-09-05, com 4 queries de leitura
-- (information_schema.columns, pg_constraint, pg_class.relrowsecurity,
-- pg_policies) — nada aqui foi adivinhado.

-- ── admins ───────────────────────────────────────────────────────────────
-- Uma linha por conta com acesso ao painel /admin. user_id aponta para o
-- utilizador de auth.users que faz login; email é guardado à parte (não lido
-- de auth.users) para as várias páginas /admin/*/page.tsx conseguirem juntar
-- admin_id -> email em admin_audit_log sem precisar de service_role.
create table if not exists admins (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  email      text not null,
  created_at timestamptz default now()
);

alter table admins enable row level security;

-- Confirmado em produção: só esta policy existe (SELECT). Sem policy de
-- INSERT/UPDATE/DELETE — contas de admin continuam a só poder ser
-- criadas/alteradas manualmente via Supabase Studio (service_role), nunca
-- pelo próprio admin autenticado. Necessária para as páginas client-side
-- app/admin/*/page.tsx (usam o cliente anon, não supabaseAdmin) confirmarem
-- "sou admin?" lendo a própria linha.
create policy if not exists "Admin reads own record"
  on admins for select
  using (auth.uid() = user_id);

-- ── admin_audit_log ──────────────────────────────────────────────────────
-- Um registo por alteração feita por um admin à ficha de um profissional
-- (ver app/api/admin/professionals/[id]/route.ts). admin_id referencia
-- auth.users(id) diretamente (não admins.id) — é o mesmo id devolvido por
-- getAuthenticatedAdmin() em lib/admin-auth.ts.
create table if not exists admin_audit_log (
  id              uuid primary key default gen_random_uuid(),
  admin_id        uuid not null references auth.users(id),
  professional_id uuid not null references professionals(id),
  changes         jsonb not null,
  created_at      timestamptz not null default now()
);

alter table admin_audit_log enable row level security;

-- Confirmado em produção: só esta policy existe (SELECT). Sem policy de
-- INSERT — a escrita (no route.ts acima) é sempre feita via supabaseAdmin
-- (service_role, que ignora RLS), nunca pelo cliente autenticado.
create policy if not exists "Admins read audit log"
  on admin_audit_log for select
  using (exists (select 1 from admins where admins.user_id = auth.uid()));
