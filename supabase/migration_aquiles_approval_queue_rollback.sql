-- Reverte APENAS os objetos novos de migration_aquiles_approval_queue.sql —
-- funções e role. NÃO apaga a tabela aquiles_pending_actions nem nenhuma
-- linha dela: é o registo de auditoria das aprovações já decididas/usadas,
-- e apagar a tabela apagaria esse histórico. Se um dia for mesmo necessário
-- remover a tabela, fazê-lo à parte, depois de confirmar explicitamente que
-- não há linhas com status 'approved' ou 'executed' a perder (ver query no
-- fim deste ficheiro, comentada).

begin;

revoke all on function public.aquiles_request_action(text, text, jsonb) from site_ops_actions_server;
revoke all on function public.aquiles_get_action(uuid) from site_ops_actions_server;
revoke all on function public.aquiles_list_pending() from site_ops_actions_server;
revoke all on function public.aquiles_consume_approved_action(uuid, text, jsonb) from site_ops_actions_server;
revoke usage on schema public from site_ops_actions_server;

drop function if exists public.aquiles_request_action(text, text, jsonb);
drop function if exists public.aquiles_get_action(uuid);
drop function if exists public.aquiles_list_pending();
drop function if exists public.aquiles_consume_approved_action(uuid, text, jsonb);

-- Role sem LOGIN primeiro — se algum dia tiver password definida, uma
-- sessão ainda ligada com credenciais antigas deixa de conseguir autenticar
-- de novo, mas isto nunca falha mesmo que nunca tenha havido password.
alter role site_ops_actions_server nologin;
drop role if exists site_ops_actions_server;

commit;

-- Para remover também a tabela (só depois de confirmar que não há nada a
-- perder — correr esta query ANTES, nunca às cegas):
--   select count(*) from public.aquiles_pending_actions where status in ('approved','executed');
-- Se devolver 0, então, à parte, numa transação própria:
--   drop policy if exists "Admins read aquiles actions" on public.aquiles_pending_actions;
--   drop table if exists public.aquiles_pending_actions;
