-- FaçoPorTi — distingue "aprovação consumida" de "execução concluída" na
-- fila do Aquiles (ver migration_aquiles_approval_queue.sql). Corrige uma
-- lacuna real: a versão anterior de aquiles_consume_approved_action marcava
-- 'executed' no mesmo instante em que validava a aprovação — ANTES de a
-- operação real (apagar, mover dinheiro, publicar) acontecer. Se essa
-- operação falhasse depois, a linha ficava com 'executed' como se tivesse
-- tido sucesso, sem nenhum registo da falha, e sem forma de distinguir os
-- dois casos.
--
-- Agora: approved -> consumed (aquiles_consume_approved_action, inalterado
-- no resto da lógica: utilização única, validade, parâmetros exatos) ->
-- executed | failed (aquiles_record_execution_result, com o resultado
-- real). A aprovação está gasta desde o momento do consumo — nunca pode ser
-- reutilizada, quer a operação real tenha sucesso quer falhe.
--
-- Só aditivo/alterativo nos objetos já criados pela migração anterior;
-- não toca em nenhum outro objeto do projeto. Ver
-- migration_aquiles_approval_queue_execution_result_rollback.sql.

begin;

alter table public.aquiles_pending_actions
  drop constraint if exists aquiles_pending_actions_status_check;

alter table public.aquiles_pending_actions
  add constraint aquiles_pending_actions_status_check
  check (status in ('pending','approved','rejected','consumed','executed','failed'));

alter table public.aquiles_pending_actions
  add column if not exists consumed_at timestamptz;

-- ── aquiles_consume_approved_action: agora só adquire o "lock" de
-- utilização única (approved -> consumed). NUNCA significa sucesso — só
-- confirma que esta instância de aprovação está gasta e a operação real
-- pode começar. O resto da lógica é igual: dentro da validade, action_type
-- e payload exatos, atómico.
create or replace function public.aquiles_consume_approved_action(
  p_id uuid,
  p_action_type text,
  p_payload jsonb
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  did_consume boolean;
begin
  update public.aquiles_pending_actions
  set status = 'consumed', consumed_at = now()
  where id = p_id
    and requested_by = session_user
    and status = 'approved'
    and (expires_at is null or expires_at > now())
    and action_type = p_action_type
    and payload = coalesce(p_payload, '{}'::jsonb);

  did_consume := found;
  return did_consume;
end;
$$;

-- ── aquiles_record_execution_result: regista o resultado REAL depois de a
-- operação ter sido tentada. Só transita consumed -> executed (sucesso) ou
-- consumed -> failed (falha) — nunca a partir de pending/approved/rejected,
-- e nunca duas vezes sobre a mesma linha (depois de executed/failed já não
-- está em 'consumed', por isso uma segunda chamada falha sempre).
create or replace function public.aquiles_record_execution_result(
  p_id uuid,
  p_success boolean,
  p_result jsonb
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  did_update boolean;
begin
  update public.aquiles_pending_actions
  set status = case when p_success then 'executed' else 'failed' end,
      executed_at = now(),
      result = coalesce(p_result, '{}'::jsonb)
  where id = p_id
    and requested_by = session_user
    and status = 'consumed';

  did_update := found;
  return did_update;
end;
$$;

comment on function public.aquiles_consume_approved_action(uuid, text, jsonb) is
  'Único ponto que adquire a aprovação (approved -> consumed), de utilização única. NÃO significa sucesso — aquiles_record_execution_result é que regista o resultado real, depois.';
comment on function public.aquiles_record_execution_result(uuid, boolean, jsonb) is
  'Regista o resultado real da operação: consumed -> executed (sucesso) ou consumed -> failed (falha). Impossível sem ter consumido a aprovação primeiro (tem de estar em consumed); impossível repetir.';

revoke all on function public.aquiles_record_execution_result(uuid, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.aquiles_record_execution_result(uuid, boolean, jsonb) to site_ops_actions_server;

commit;
