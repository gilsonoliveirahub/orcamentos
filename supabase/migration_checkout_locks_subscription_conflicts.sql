-- Proteção contra dupla subscrição (2026-09-19, decisão de negócio:
-- corrigir antes de haver clientes pagantes). Revisão adversarial
-- (2026-09-19, segunda passagem) corrigiu 3 falhas reais na primeira
-- versão desta migração/código — ver comentários junto de cada peça.
--
-- NÃO EXECUTAR sem autorização explícita — este ficheiro é só para revisão.

-- ── checkout_locks ──────────────────────────────────────────────────────
-- Uma linha por profissional COM uma operação de checkout em curso — a
-- PRIMARY KEY em professional_id é a própria proteção: só pode existir uma
-- reserva por profissional a qualquer momento.
create table if not exists checkout_locks (
  professional_id     uuid primary key references professionals(id) on delete cascade,
  idempotency_key      text not null,
  plan                  text not null,
  cycle                 text not null,
  checkout_session_id  text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on table checkout_locks is
  'Reserva atómica por profissional para impedir checkouts concorrentes (lib/checkout-lock.ts). checkout_session_id fica vazio até a Checkout Session ser criada; a linha só é apagada quando o Stripe confirma o desfecho (checkout.session.completed/expired) ou, no caminho de upgrade/downgrade de uma subscrição já existente, no fim do próprio pedido. Toda a leitura/escrita usada para decidir libertar ou substituir uma reserva é sempre condicionada por (professional_id, idempotency_key) em conjunto — nunca só por professional_id — para um pedido antigo/atrasado nunca poder tocar numa reserva mais recente para a mesma conta.';

alter table checkout_locks enable row level security;
-- Sem policies: só o service_role (usado por app/api/stripe/checkout e
-- app/api/stripe/webhook) tem acesso — nunca exposto ao browser (ver
-- lib/supabase-admin.ts: usa SUPABASE_SERVICE_ROLE_KEY, um segredo só de
-- servidor, nunca NEXT_PUBLIC_*, e só é importado por rotas app/api/**,
-- nunca por componentes 'use client').

-- FALHA REAL #1 (corrigida): a primeira versão libertava e recriava a
-- reserva com uma idempotency_key NOVA sempre que a via "obsoleta" (sem
-- checkout_session_id, idade > 2 min). Isto é inseguro: se a chamada
-- original ao Stripe tinha na realidade sido bem sucedida e só a ESCRITA
-- local (attachCheckoutSession) é que falhou depois, uma chave nova cria
-- uma SEGUNDA sessão/subscrição real no Stripe. A correção (ver
-- lib/checkout-lock.ts, resumeStaleLock) é retomar a MESMA operação com a
-- MESMA idempotency_key nesse caso — nunca gerar uma chave nova enquanto
-- não houver confirmação do Stripe de que a operação anterior terminou.
--
-- Uma chave nova só é gerada quando o Stripe já confirmou (via
-- checkout.sessions.retrieve) que a sessão anterior está mesmo 'expired' —
-- aí sim é seguro abrir uma operação nova. Essa transição (fechar a
-- reserva expirada, abrir uma nova) tem de ser atómica — ver FALHA #2.

-- FALHA REAL #2 (corrigida): fechar uma reserva expirada e abrir uma nova
-- como dois passos separados (DELETE, depois INSERT) tem uma janela de
-- corrida real: dois pedidos concorrentes podiam ambos ver a reserva como
-- "expirada", ambos apagá-la (ou um apagar e o outro inserir por cima antes
-- do primeiro terminar), e ambos acabar a criar uma sessão nova cada — a
-- MESMA falha que esta proteção existe para evitar. A troca tem de ser uma
-- operação transacional única, guardada pela idempotency_key que o
-- chamador ESPERAVA encontrar (nunca troca uma reserva que já mudou
-- entretanto — essa é a mesma garantia da FALHA #3/requisito 2).
create or replace function replace_expired_checkout_lock(
  p_professional_id uuid,
  p_expected_idempotency_key text,
  p_new_idempotency_key text,
  p_new_plan text,
  p_new_cycle text
) returns text
language plpgsql
as $$
declare
  v_current_key text;
begin
  -- Serializa chamadas concorrentes para o MESMO profissional dentro desta
  -- função — a mesma transação que já envolve a chamada RPC (o PostgREST
  -- corre cada RPC na sua própria transação) garante que o lock advisory é
  -- libertado no fim, sem precisar de BEGIN/COMMIT explícito aqui.
  perform pg_advisory_xact_lock(hashtext(p_professional_id::text));

  select idempotency_key into v_current_key
  from checkout_locks
  where professional_id = p_professional_id;

  if v_current_key is distinct from p_expected_idempotency_key then
    -- A reserva já não é a que o chamador esperava (foi substituída ou
    -- libertada por outro pedido entretanto, ou nunca existiu) — nunca
    -- tocamos nela. Devolve o que está lá agora (pode ser null) para o
    -- chamador decidir o que fazer, sem inventar nada.
    return v_current_key;
  end if;

  delete from checkout_locks
  where professional_id = p_professional_id
    and idempotency_key = p_expected_idempotency_key;

  insert into checkout_locks (professional_id, idempotency_key, plan, cycle)
  values (p_professional_id, p_new_idempotency_key, p_new_plan, p_new_cycle);

  return p_new_idempotency_key;
end;
$$;

comment on function replace_expired_checkout_lock is
  'Só chamado quando o Stripe já confirmou (status=expired) que a Checkout Session anterior terminou. Troca atómica: fecha a reserva expirada e abre uma nova com chave nova, tudo dentro de um advisory lock por profissional — nunca há uma janela em que dois pedidos concorrentes consigam ambos "vencer" a mesma troca. Guardado por p_expected_idempotency_key: se a reserva já mudou entretanto, esta função não faz nada e devolve o estado real.';

-- ── subscription_conflicts ──────────────────────────────────────────────
create table if not exists subscription_conflicts (
  id                        uuid primary key default gen_random_uuid(),
  professional_id           uuid not null references professionals(id) on delete cascade,
  existing_subscription_id text,
  new_subscription_id      text not null,
  source                    text not null, -- 'checkout_reconciliation' | 'checkout.session.completed' | 'invoice.payment_succeeded' | 'customer.subscription.updated'
  event_id                  text,
  detected_at               timestamptz not null default now(),
  resolved                  boolean not null default false,
  resolved_at               timestamptz,
  resolution_notes          text
);

comment on table subscription_conflicts is
  'Registo de possível dupla subscrição — nunca resolvido automaticamente (decisão de negócio: uma cobrança duplicada confirmada é analisada e reembolsada manualmente). existing_subscription_id é o que já estava guardado em professionals.stripe_subscription_id no momento da deteção (pode ser null); new_subscription_id é o que apareceu a mais (pode ser uma lista separada por vírgulas, quando a reconciliação encontra 2+ de uma vez). resolved/resolved_at/resolution_notes ficam para um admin preencher manualmente — nenhum código escreve nestes 3 campos.';

alter table subscription_conflicts enable row level security;
-- Mesmo motivo que checkout_locks — só o service_role escreve/lê. Uma
-- policy de leitura para admins (tabela `admins`, ver
-- migration_admins_admin_audit_log.sql) pode ser adicionada mais tarde, se
-- vier a existir uma página /admin para gerir estes conflitos.

create index if not exists subscription_conflicts_professional_id_idx on subscription_conflicts(professional_id);
create index if not exists subscription_conflicts_unresolved_idx on subscription_conflicts(detected_at) where not resolved;

-- FALHA REAL #3 (corrigida): sem isto, o MESMO par (existing, new) podia
-- ficar registado em duas linhas diferentes se o mesmo conflito fosse
-- detetado por duas entregas de webhook distintas (eventos diferentes, não
-- o mesmo event_id — a guarda de idempotência em stripe_webhook_events só
-- cobre entregas repetidas do MESMO evento, não duas fontes diferentes a
-- apanharem a mesma inconsistência). Índice parcial: só entre conflitos
-- ainda não resolvidos — depois de um admin marcar resolved=true, um novo
-- conflito real com o mesmo par de IDs (situação diferente, ex: voltou a
-- acontecer depois de "resolvido") tem de poder ser registado outra vez.
create unique index if not exists subscription_conflicts_unresolved_pair_idx
  on subscription_conflicts (professional_id, existing_subscription_id, new_subscription_id)
  where not resolved;

-- ── professionals.stripe_customer_id — índice único parcial ─────────────
-- Requisito confirmado (2026-09-19): sem isto, nada impede duas linhas de
-- `professionals` apontarem para o MESMO Customer Stripe (bug de escrita,
-- corrida, ou intervenção manual) — o que tornaria ambíguo identificar QUAL
-- profissional pertence a um evento de webhook só pelo stripe_customer_id
-- (ver app/api/stripe/webhook/route.ts: se a consulta encontrar mais do que
-- uma linha, o código nunca escolhe uma arbitrariamente — regista o caso
-- nos logs do servidor e não toca em nada). Auditoria em produção
-- (2026-09-19) confirmou que isto NUNCA aconteceu até agora — este índice
-- é só prevenção. Parcial (`where ... is not null`) porque múltiplas linhas
-- com stripe_customer_id NULL (nunca assinaram) são normais e não devem
-- colidir.
create unique index if not exists professionals_stripe_customer_id_unique_idx
  on professionals (stripe_customer_id)
  where stripe_customer_id is not null;

-- ── Limpeza futura (documentado, não implementado agora) ────────────────
-- checkout_locks nunca é limpa por um job periódico — cada pedido novo
-- resolve/recicla a reserva do profissional em causa sozinho (ver
-- lib/checkout-lock.ts + app/api/stripe/checkout/route.ts), por isso uma
-- reserva really abandonada só ocupa espaço, nunca bloqueia nada para
-- sempre. Se o volume um dia justificar limpeza ativa, uma query simples
-- cobre isto (não corrida automaticamente por esta migração):
--   delete from checkout_locks where created_at < now() - interval '48 hours';

-- ── ROLLBACK (documentado, não corrido automaticamente) ──────────────────
-- drop index if exists professionals_stripe_customer_id_unique_idx;
-- drop index if exists subscription_conflicts_unresolved_pair_idx;
-- drop index if exists subscription_conflicts_unresolved_idx;
-- drop index if exists subscription_conflicts_professional_id_idx;
-- drop table if exists subscription_conflicts;
-- drop function if exists replace_expired_checkout_lock(uuid, text, text, text, text);
-- drop table if exists checkout_locks;
