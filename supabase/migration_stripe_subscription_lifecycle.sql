-- Ciclo de vida real da subscrição Stripe: upgrade Starter→Pro atualiza a
-- MESMA subscrição (nunca cria uma segunda), com proration e sem mudar a
-- data de renovação; downgrade Pro→Starter é agendado numa Subscription
-- Schedule do Stripe e só entra em vigor (e cobra 19€) na renovação
-- seguinte; e processamento idempotente de eventos do Stripe (entregas
-- repetidas não podem duplicar efeitos, ex: créditos do marketplace).
--
-- Aplicado em produção (projeto facoporti) em 2026-07-17.

-- Downgrade pedido mas ainda não aplicado — só é escrito na subscrição
-- Stripe (e espelhado aqui em "plan") quando a renovação seguinte
-- confirma o novo ciclo. Nunca usado para upgrade (esse é sempre
-- imediato, com proration).
alter table professionals add column if not exists pending_plan text;

-- Um registo por evento Stripe processado. O id do evento (ev.id) é único
-- por natureza no Stripe; a chave primária aqui é o que torna o webhook
-- idempotente — uma entrega repetida do MESMO evento (o Stripe garante
-- "at-least-once", nunca "exactly-once") falha a inserção por violação de
-- unicidade, e a rota devolve 200 sem repetir nenhum efeito secundário
-- (nunca creditar duas vezes marketplace_credits, por exemplo).
create table if not exists stripe_webhook_events (
  event_id   text primary key,
  event_type text,
  created_at timestamptz default now()
);

-- Sem RLS, qualquer cliente autenticado/anónimo podia ler ou (pior) inserir
-- diretamente um event_id via REST, pré-preenchendo o id de um evento
-- Stripe real futuro e fazendo o webhook tratá-lo como duplicado (ignorado
-- em silêncio). Só o service_role (usado pelo webhook) precisa de acesso.
alter table stripe_webhook_events enable row level security;
