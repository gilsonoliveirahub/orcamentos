-- Reverte migration_aquiles_approval_queue_execution_result.sql, voltando
-- aquiles_consume_approved_action ao comportamento anterior (approved ->
-- executed diretamente). Não apaga nenhuma linha. Se alguma linha já estiver
-- em 'consumed' ou 'failed' quando isto correr, fica num estado que o check
-- constraint antigo não reconhece — por isso este rollback só deve ser
-- usado se tiver a certeza de que não há linhas nesses dois estados (ver
-- query abaixo, correr ANTES).

begin;

revoke all on function public.aquiles_record_execution_result(uuid, boolean, jsonb) from site_ops_actions_server;
drop function if exists public.aquiles_record_execution_result(uuid, boolean, jsonb);

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
  set status = 'executed', executed_at = now()
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

alter table public.aquiles_pending_actions
  drop constraint if exists aquiles_pending_actions_status_check;

alter table public.aquiles_pending_actions
  add constraint aquiles_pending_actions_status_check
  check (status in ('pending','approved','rejected','executed'));

-- consumed_at não é removida por omissão (coluna vazia não parte nada);
-- remover só à parte, depois de confirmar que não há nada a perder:
--   select count(*) from public.aquiles_pending_actions where status in ('consumed','failed');
-- se devolver 0:
--   alter table public.aquiles_pending_actions drop column if exists consumed_at;

commit;
