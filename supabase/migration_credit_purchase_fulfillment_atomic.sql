-- Créditos do marketplace — atribuição atómica por checkout.session.id
-- (2026-09-27), mesmo padrão de unlock_marketplace_lead_by_credit() em
-- migration_marketplace_v4_unlock_atomic.sql.
--
-- Motivo: ao ativar MB WAY/Multibanco nas compras de créditos
-- (app/api/stripe/credits/route.ts), o webhook passou a poder creditar a
-- MESMA compra a partir de dois eventos Stripe diferentes —
-- checkout.session.completed (cartão/MB WAY, síncronos) e
-- checkout.session.async_payment_succeeded (Multibanco, confirmação
-- tardia). stripe_webhook_events só impede reentrega do MESMO event_id;
-- nunca impedia dois EVENTOS DIFERENTES (completed + async_payment_succeeded)
-- creditarem a mesma sessão duas vezes. Depende inteiramente do Stripe
-- nunca marcar a mesma sessão como "paga" nos dois eventos — garantia
-- documentada, mas externa, nunca verificada pelo nosso código até agora.
--
-- Corrige também um problema pré-existente, sem relação com MB WAY: a
-- soma de créditos era um SELECT + UPDATE em dois passos separados
-- (lost update possível se duas compras do mesmo profissional forem
-- processadas em paralelo).
--
-- NÃO APLICADO em produção — ficheiro só criado localmente, a aplicar
-- manualmente mais tarde (mesmo fluxo dos restantes migration_*.sql deste
-- repositório).

-- Um registo por Checkout Session já creditada. A chave primária é o que
-- torna a atribuição idempotente por COMPRA (não só por evento) — chamar
-- esta função duas vezes com o mesmo session_id (venha de
-- checkout.session.completed, de checkout.session.async_payment_succeeded,
-- ou de uma reentrega) só credita da primeira vez.
create table if not exists stripe_credit_fulfillments (
  session_id     text primary key,
  professional_id uuid not null references professionals(id),
  credits        integer not null,
  created_at     timestamptz default now()
);

-- Sem políticas — só o service_role (usado pelo webhook) acede a esta
-- tabela, mesmo padrão de stripe_webhook_events.
alter table stripe_credit_fulfillments enable row level security;

-- ============================================================
-- Tudo numa única transação implícita da função:
--   1. Bloqueia a linha do profissional (FOR UPDATE) — serializa qualquer
--      tentativa concorrente de creditar o MESMO profissional (duas
--      compras a chegar quase ao mesmo tempo nunca se pisam).
--   2. Tenta inserir o session_id em stripe_credit_fulfillments. Se já
--      existir (ON CONFLICT DO NOTHING), esta compra já foi creditada
--      antes — devolve sucesso idempotente sem tocar no saldo outra vez.
--   3. Só agora, e só uma vez, incrementa marketplace_credits num único
--      UPDATE (atómico — nunca lê o saldo em JS para depois o escrever).
-- ============================================================
create or replace function fulfill_credit_purchase(
  p_session_id text,
  p_professional_id uuid,
  p_credits integer
)
returns jsonb
language plpgsql
as $$
declare
  v_prof record;
  v_new_balance integer;
begin
  select id, marketplace_credits
    into v_prof
    from professionals
    where id = p_professional_id
    for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  insert into stripe_credit_fulfillments (session_id, professional_id, credits)
  values (p_session_id, p_professional_id, p_credits)
  on conflict (session_id) do nothing;

  if not found then
    return jsonb_build_object('ok', true, 'already_fulfilled', true, 'balance', v_prof.marketplace_credits);
  end if;

  update professionals
    set marketplace_credits = marketplace_credits + p_credits
    where id = p_professional_id
    returning marketplace_credits into v_new_balance;

  return jsonb_build_object('ok', true, 'already_fulfilled', false, 'balance', v_new_balance);
end;
$$;

-- Só o service_role (via supabaseAdmin, no webhook) pode chamar esta
-- função — recebe p_professional_id como parâmetro, nunca derivado de
-- auth.uid(), por isso nunca pode ficar executável pelo cliente
-- autenticado (permitiria creditar a conta de outro profissional).
revoke all on function fulfill_credit_purchase(text, uuid, integer) from public, authenticated, anon;
grant execute on function fulfill_credit_purchase(text, uuid, integer) to service_role;
