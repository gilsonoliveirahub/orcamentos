-- Pedidos de avaliação submetidos por visitantes do perfil público
-- (2026-09-24): acrescenta os estados 'requested' (pedido do visitante,
-- ainda por confirmar pelo profissional) e 'rejected' (profissional não
-- reconheceu o contacto como cliente) a review_invites. Nenhum convite é
-- enviado ao criar um 'requested' — só depois do profissional confirmar em
-- /perfil é que passa a 'pending' e o link é mesmo enviado (ver
-- app/api/review-invites/request/route.ts e app/api/review-invites/[id]/route.ts).
--
-- NÃO APLICADO em produção — ficheiro só criado localmente, a aplicar
-- manualmente mais tarde, só depois de aprovação explícita.

-- Substitui o check de status (nome exato não assumido — encontra o
-- constraint de check existente na coluna e remove-o antes de criar o novo,
-- em vez de assumir o nome gerado automaticamente pelo Postgres).
do $$
declare
  conname text;
begin
  select con.conname into conname
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  where rel.relname = 'review_invites'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%status%'
    and pg_get_constraintdef(con.oid) ilike '%pending%';
  if conname is not null then
    execute format('alter table review_invites drop constraint %I', conname);
  end if;
end $$;

alter table review_invites add constraint review_invites_status_check
  check (status in ('requested', 'pending', 'completed', 'rejected'));

-- O índice único de "um pendente por contacto" passa a cobrir também
-- 'requested' — impede um visitante de submeter o mesmo pedido várias vezes
-- enquanto o profissional não confirma nem rejeita.
drop index if exists review_invites_pending_contact_unique;
create unique index if not exists review_invites_pending_contact_unique
  on review_invites (professional_id, coalesce(lower(client_email), client_phone))
  where status in ('pending', 'requested');
