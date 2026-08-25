-- Marketplace v4 — desbloqueio por crédito (/api/leads/unlock)
-- verdadeiramente atómico, mesmo padrão de open_personal_lead()/
-- acquire_marketplace_lead() em migration_marketplace_v3_atomic.sql.
--
-- Corrige um bug confirmado em auditoria (2026-08-25): a rota anterior
-- descontava o crédito e desbloqueava o lead em duas operações
-- independentes (Promise.all), sem qualquer bloqueio de linha nem
-- verificação de que a segunda teve sucesso antes de aceitar a primeira.
-- Dois cliques rápidos no mesmo lead podiam descontar 2 créditos por 1
-- desbloqueio.
--
-- NÃO APLICADO em produção — ficheiro só criado localmente, a aplicar
-- manualmente mais tarde (mesmo fluxo dos restantes migration_*.sql deste
-- repositório).

-- ============================================================
-- Desbloqueio atómico de um lead do marketplace já atribuído a este
-- profissional mas ainda bloqueado (locked=true) — o mecanismo antigo de
-- desbloqueio por crédito, distinto de acquire_marketplace_lead() (que é
-- para leads ainda sem professional_id, vindos do pool).
--
-- Tudo numa única transação implícita da função:
--   1. Bloqueia a linha do profissional (FOR UPDATE) — serializa qualquer
--      tentativa concorrente de desbloqueio pelo MESMO profissional,
--      incluindo dois cliques rápidos no mesmo lead.
--   2. Bloqueia a linha do lead (FOR UPDATE) e confirma que pertence a
--      este profissional.
--   3. Se já estava desbloqueado (locked=false), devolve sucesso
--      idempotente sem descontar crédito outra vez (duplo clique).
--   4. Só desconta o crédito e desbloqueia depois de confirmar que há
--      crédito suficiente — ou conclui tudo, ou não altera nada.
-- ============================================================
create or replace function unlock_marketplace_lead_by_credit(p_lead_id uuid, p_professional_id uuid)
returns jsonb
language plpgsql
as $$
declare
  v_prof record;
  v_lead record;
begin
  select id, marketplace_credits
    into v_prof
    from professionals
    where id = p_professional_id
    for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select id, locked
    into v_lead
    from leads
    where id = p_lead_id and professional_id = p_professional_id
    for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if coalesce(v_lead.locked, false) = false then
    return jsonb_build_object('ok', true, 'already_unlocked', true);
  end if;

  if coalesce(v_prof.marketplace_credits, 0) < 1 then
    return jsonb_build_object('ok', false, 'error', 'credits');
  end if;

  update professionals set marketplace_credits = marketplace_credits - 1 where id = p_professional_id;
  update leads set locked = false where id = p_lead_id;

  return jsonb_build_object('ok', true, 'already_unlocked', false);
end;
$$;

-- Só o service_role (via supabaseAdmin) pode chamar esta função — recebe
-- p_professional_id como parâmetro em vez de o derivar de auth.uid(), por
-- isso nunca pode ficar executável pelo cliente autenticado (permitiria
-- desbloquear/descontar crédito de outro profissional). REVOKE explícito
-- de PUBLIC/anon/authenticated e GRANT explícito só a service_role — não
-- depender apenas do REVOKE de PUBLIC para o service_role continuar a
-- conseguir executar.
revoke all on function unlock_marketplace_lead_by_credit(uuid, uuid) from public, authenticated, anon;
grant execute on function unlock_marketplace_lead_by_credit(uuid, uuid) to service_role;
