-- NÃO EXECUTAR EM PRODUÇÃO SEM AUTORIZAÇÃO FINAL — preparado localmente,
-- só aplicar depois de aprovação explícita (mesmo fluxo dos restantes
-- migration_*.sql deste repositório: SQL Editor do Supabase Studio).
--
-- Acrescenta 'registration_completed' aos tipos de evento aceites em
-- analytics_events — novo evento, gravado só pelo servidor
-- (app/api/auth/register/route.ts via lib/analytics.ts
-- recordRegistrationCompleted), nunca aceite via /api/track. Conta um
-- registo de profissional ou de cliente concluído com sucesso, para o
-- painel de métricas conseguir mostrar "visitantes → registos → pedidos"
-- como funil, não só visitas e pedidos.

do $$
declare
  conname text;
begin
  select con.conname into conname
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  where rel.relname = 'analytics_events'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%event_type%'
    and pg_get_constraintdef(con.oid) ilike '%page_view%';
  if conname is not null then
    execute format('alter table analytics_events drop constraint %I', conname);
  end if;
end $$;

alter table analytics_events add constraint analytics_events_event_type_check
  check (event_type in (
    'page_view',
    'quote_cta_click',
    'request_started',
    'request_completed',
    'whatsapp_click',
    'email_click',
    'registration_completed'
  ));
