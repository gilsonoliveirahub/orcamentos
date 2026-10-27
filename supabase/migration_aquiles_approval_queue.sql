-- FaçoPorTi — fila de aprovação assíncrona para ações sensíveis do Aquiles
-- Proposta LOCAL. Não aplicar em produção sem aprovação explícita (passo
-- separado de "implementar" — ver memória: implementar/migração/commit/
-- push/deploy são passos distintos, nunca encadeados sem pedido explícito).
--
-- Objetivo: dar ao Aquiles (perfil site-facoporti-ops) uma forma de propor
-- ações que ele NUNCA pode aprovar a si mesmo — apagar definitivamente,
-- mover dinheiro, alterar acessos de segurança, publicar/fazer deploy (ou
-- qualquer outra ação sensível não prevista, via 'other_sensitive'). A
-- aprovação só acontece pela sessão de admin humana já existente
-- (getAuthenticatedAdmin(), página /admin/aquiles), nunca pelo token do
-- Aquiles — por isso este role nunca recebe EXECUTE em nenhuma função de
-- decisão. Esta tabela funciona também como o registo de auditoria exigido
-- (nunca apagar linhas; status só avança, nunca retrocede).
--
-- Só aditivo: cria role/tabela/funções novos, não altera nenhum objeto
-- (tabela/role/policy/função) já existente no projeto. Ver
-- migration_aquiles_approval_queue_rollback.sql para desfazer só isto.
--
-- Identidade do Aquiles NUNCA é um parâmetro em que a função confia — é
-- sempre `session_user`, o role Postgres com que a ligação foi autenticada
-- (via password dedicada no pooler). Isto garante tecnicamente, não só por
-- convenção da app, que o Aquiles nunca consegue ler/consumir uma ação
-- pedida por outro perfil, mesmo que tente passar outro valor.

begin;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'site_ops_actions_server') then
    create role site_ops_actions_server nologin;
  end if;
end
$$;

create table if not exists public.aquiles_pending_actions (
  id              uuid primary key default gen_random_uuid(),
  action_type     text not null check (action_type in ('delete_permanent','money_movement','security_access_change','publish_deploy','other_sensitive')),
  summary         text not null check (btrim(summary) <> ''),
  payload         jsonb not null default '{}'::jsonb,
  requested_by    text not null check (btrim(requested_by) <> ''),
  status          text not null default 'pending' check (status in ('pending','approved','rejected','executed')),
  requested_at    timestamptz not null default now(),
  decided_at      timestamptz,
  decided_by      uuid references auth.users(id),
  decision_note   text,
  expires_at      timestamptz,
  executed_at     timestamptz,
  result          jsonb
);

alter table public.aquiles_pending_actions enable row level security;

-- Sem policies de INSERT/UPDATE para ninguém: a única escrita de criação
-- passa por aquiles_request_action() (SECURITY DEFINER); a única escrita de
-- decisão/consumo passa pelo servidor Next.js com supabaseAdmin
-- (service_role, que ignora RLS — mesmo padrão já usado em admin_audit_log)
-- ou pela função aquiles_consume_approved_action() abaixo.
drop policy if exists "Admins read aquiles actions" on public.aquiles_pending_actions;
create policy "Admins read aquiles actions"
  on public.aquiles_pending_actions for select
  using (exists (select 1 from public.admins where admins.user_id = auth.uid()));

revoke all on public.aquiles_pending_actions from public, anon, authenticated;

-- ── aquiles_request_action: único ponto de escrita disponível ao token do
-- Aquiles. Cria sempre em 'pending', com requested_by = session_user (nunca
-- um parâmetro) — nunca aceita um estado diferente nem um "dono" forjado.
create or replace function public.aquiles_request_action(
  p_action_type text,
  p_summary text,
  p_payload jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_id uuid;
begin
  if p_action_type not in ('delete_permanent','money_movement','security_access_change','publish_deploy','other_sensitive') then
    raise exception 'action_type inválido: %', p_action_type;
  end if;
  if btrim(coalesce(p_summary, '')) = '' then
    raise exception 'summary obrigatório';
  end if;

  insert into public.aquiles_pending_actions (action_type, summary, payload, requested_by)
  values (p_action_type, p_summary, coalesce(p_payload, '{}'::jsonb), session_user)
  returning id into new_id;

  return new_id;
end;
$$;

-- ── aquiles_get_action / aquiles_list_pending: o Aquiles só vê as suas
-- próprias ações. "Suas próprias" = requested_by igual a session_user, o
-- role com que esta própria chamada está autenticada — nunca um filtro que
-- o chamador controla.
create or replace function public.aquiles_get_action(p_id uuid)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select to_jsonb(a) from public.aquiles_pending_actions a
  where a.id = p_id and a.requested_by = session_user;
$$;

create or replace function public.aquiles_list_pending()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(to_jsonb(a) order by a.requested_at desc), '[]'::jsonb)
  from public.aquiles_pending_actions a
  where a.requested_by = session_user
    and a.status in ('pending', 'approved');
$$;

-- ── aquiles_consume_approved_action: o ÚNICO ponto por onde uma ação
-- sensível pode mesmo ser executada. Qualquer endpoint futuro que realize a
-- operação real (apagar, mover dinheiro, publicar, etc.) tem de chamar esta
-- função ANTES de agir, e só agir se ela devolver true. Não é um "marcar
-- como feita" depois do facto — é o próprio controlo, atómico:
--   1. status tem de ser 'approved' (nunca pending/rejected/já executada);
--   2. dentro da validade (expires_at nulo ou no futuro);
--   3. action_type e payload têm de coincidir exatamente com o que foi
--      aprovado — a aprovação está vinculada à ação E aos parâmetros
--      exatos, não só ao id;
--   4. a mesma instrução UPDATE que valida já transita para 'executed' —
--      por isso é de utilização única: uma segunda chamada (mesmos
--      parâmetros, mesmo id) já não encontra status='approved' e devolve
--      false, nunca reexecuta.
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

comment on function public.aquiles_request_action(text, text, jsonb) is
  'Único ponto de escrita para o token do Aquiles: cria sempre em pending, dono = session_user. A aprovação é exclusiva da sessão admin humana (/admin/aquiles), nunca deste role.';
comment on function public.aquiles_consume_approved_action(uuid, text, jsonb) is
  'Único ponto que autoriza executar uma ação real: approved + dentro da validade + action_type/payload exatos, consumido atomicamente (utilização única). Nunca confiar num simples "mark executed" depois do facto.';

revoke all on function public.aquiles_request_action(text, text, jsonb) from public, anon, authenticated;
revoke all on function public.aquiles_get_action(uuid) from public, anon, authenticated;
revoke all on function public.aquiles_list_pending() from public, anon, authenticated;
revoke all on function public.aquiles_consume_approved_action(uuid, text, jsonb) from public, anon, authenticated;

grant usage on schema public to site_ops_actions_server;
grant execute on function public.aquiles_request_action(text, text, jsonb) to site_ops_actions_server;
grant execute on function public.aquiles_get_action(uuid) to site_ops_actions_server;
grant execute on function public.aquiles_list_pending() to site_ops_actions_server;
grant execute on function public.aquiles_consume_approved_action(uuid, text, jsonb) to site_ops_actions_server;

-- Nunca conceder EXECUTE em nenhuma função de aprovação/rejeição a este
-- role — essa transição só existe pelo caminho admin (update direto via
-- supabaseAdmin no servidor Next.js, autenticado por getAuthenticatedAdmin(),
-- nunca pelo token do Aquiles). Não existe nenhuma função SQL de "decide" —
-- é escrita direta porque já corre sob service_role, igual ao resto do
-- /admin.

-- Password definida à parte, fora de controlo de versão (igual ao padrão
-- já usado para site_ops_readonly_server) — passo seguinte, ainda não
-- autorizado nesta etapa. Sem password, este role fica criado mas incapaz
-- de se ligar; `login` fica preparado mas inofensivo até lá.
alter role site_ops_actions_server login;

commit;
