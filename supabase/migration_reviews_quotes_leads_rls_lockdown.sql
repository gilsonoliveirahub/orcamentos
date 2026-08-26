-- Grupo 2 (2026-08-25) — remove os INSERT públicos (`with check (true)`) de
-- leads, quotes e reviews. Todos os caminhos legítimos de criação já passam
-- por rotas server-side (`supabaseAdmin`, service_role — que tem
-- `bypassrls` e por isso nunca é afetado por RLS): `/api/leads/public`,
-- `/api/leads/marketplace`, `/api/leads/create`, `/api/quote/generate`,
-- `/api/quote/estimate`, `/api/reviews`. As policies `*_insert_public`
-- só serviam para permitir dois inserts diretos do cliente que existiam
-- fora dessas rotas (reviews em app/cliente/dashboard/page.tsx, quotes em
-- app/p/[slug]/page.tsx) — ambos migrados para as rotas validadas no
-- mesmo commit desta migração. Sem elas, um insert direto via REST do
-- Supabase (anon/authenticated) a estas 3 tabelas passa a ser
-- automaticamente negado por RLS (nenhuma policy de INSERT resta para
-- esses papéis) — nunca precisa de um DENY explícito.
--
-- NÃO APLICADO em produção — ficheiro só criado localmente, a aplicar
-- manualmente mais tarde (mesmo fluxo dos restantes migration_*.sql deste
-- repositório).

drop policy if exists "leads_insert_public" on leads;
drop policy if exists "quotes_insert_public" on quotes;
drop policy if exists "reviews_insert_public" on reviews;

-- Trava ao nível da BD contra avaliações duplicadas do mesmo lead — o
-- check-então-insert em app/api/reviews/route.ts já impedia isto no caminho
-- feliz, mas não é atómico sozinho (dois submits simultâneos do mesmo
-- lead_id podiam passar ambos pelo "já existe?" antes de qualquer um
-- escrever). A rota já foi ajustada para tratar a violação desta
-- constraint como o mesmo erro 409 "Já avaliaste este serviço".
-- Não afeta linhas antigas: reviews.lead_id não tem duplicados hoje (cada
-- review é sempre criada isoladamente, nunca em lote).
alter table reviews add constraint reviews_lead_id_unique unique (lead_id);
