-- P0 (2026-09-18): proteção idempotente na criação de leads pelo link
-- pessoal (/p/[slug], rota app/api/leads/public/route.ts) — impede duplo
-- clique, retry de rede ou repetição da mesma requisição de criar 2 leads
-- para o mesmo pedido do cliente.
--
-- NÃO EXECUTAR sem autorização explícita — este ficheiro é só para revisão.
--
-- Nullable e único: leads criados por outros canais (marketplace, criação
-- manual pelo profissional) continuam sem esta chave, sem conflito —
-- Postgres não trata múltiplos valores NULL como duplicados numa constraint
-- UNIQUE, por isso não afeta nenhum lead existente nem outros fluxos.
alter table leads add column if not exists idempotency_key text unique;

comment on column leads.idempotency_key is
  'Chave (uuid) gerada no cliente no momento da submissão do formulário do link pessoal — uma segunda tentativa com a mesma chave (duplo clique, retry) devolve o lead já criado em vez de duplicar.';
