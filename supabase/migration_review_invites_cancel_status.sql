-- Gestão de convites (2026-09-25): acrescenta 'cancelled' aos estados
-- aceites em review_invites.
--   'cancelled' — profissional cancela um convite pendente. Estado FECHADO —
--                 GET/POST em app/api/review-invites/[id]/route.ts recusam
--                 qualquer convite neste estado, mesmo com token HMAC
--                 tecnicamente válido. Pode ser eliminado da lista (DELETE
--                 na mesma rota), tal como 'rejected' e um 'pending' cujo
--                 envio falhou de vez.
--
-- De propósito, NÃO há nenhum estado nem ação para apagar a avaliação de um
-- cliente — essa decisão nunca é só do profissional (2026-09-25).
--
-- NÃO EXECUTAR EM PRODUÇÃO SEM AUTORIZAÇÃO FINAL — preparado localmente,
-- só aplicar depois de aprovação explícita.

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
  check (status in ('requested', 'pending', 'completed', 'rejected', 'cancelled'));

-- Nenhuma alteração necessária ao índice único de "um pendente por
-- contacto" (review_invites_pending_contact_unique, cobre 'pending' e
-- 'requested') — cancelar já tira o convite dessa lista, libertando o
-- contacto para um convite novo, que é exatamente o comportamento desejado.
