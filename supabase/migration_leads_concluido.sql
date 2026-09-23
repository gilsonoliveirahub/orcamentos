-- "Concluído" (2026-09-23): o profissional passa a poder marcar um pedido
-- como trabalho concluído, distinto de "Fechado" (que só fecha o VALOR
-- acordado, não confirma que o trabalho foi feito). Ao concluir, dispara-se
-- um único pedido de opinião ao cliente (ver lib/complete-lead.ts) — por
-- isso este estado precisa de registar quem e quando, para auditoria e para
-- o painel de administração distinguir "concluído pelo profissional" de
-- "opinião recebida do cliente" (tabela reviews, já existente).
--
-- NÃO APLICADO em produção — ficheiro só criado localmente, a aplicar
-- manualmente mais tarde (mesmo fluxo dos restantes migration_*.sql deste
-- repositório), só depois de aprovação explícita.

alter table leads add column if not exists concluido_at timestamptz;
-- SEM "references professionals(id)" de propósito (corrigido em produção
-- 2026-09-23 depois de detetado no teste pós-publicação): uma 2ª FK de
-- leads para professionals tornava ambíguo qualquer `professionals(*)`
-- embutido via PostgREST em TODO o código (o que já existia, ex.
-- /api/leads/open, /api/admin/leads/[id] — nenhum destes pede a relação
-- por nome) — partia silenciosamente a página de cada pedido (devolvia
-- lead: null) em vez de dar erro claro. concluido_by continua a guardar o
-- uuid do profissional (sempre igual a leads.professional_id, único que
-- pode concluir) só que sem constraint de integridade referencial formal.
alter table leads add column if not exists concluido_by uuid;

comment on column leads.concluido_at is
  'Momento em que o profissional marcou este pedido como concluído (Concluído) — definido uma única vez, nunca reescrito por reenvios do email de pedido de opinião.';
comment on column leads.concluido_by is
  'Profissional que marcou este pedido como concluído — hoje é sempre o mesmo que leads.professional_id (só o dono do lead pode concluir). Sem FK formal de propósito: ver comentário acima sobre ambiguidade de embed no PostgREST.';

-- Estado 'concluido' passa a válido em leads.status. IMPORTANTE (verificado
-- por leitura direta à produção antes de aplicar, 2026-09-23): apesar de
-- schema.sql documentar `default 'novo' check (status in (...))`, essa
-- constraint NUNCA chegou a existir na base real — leads.status está hoje
-- sem nenhum check. 'pendente' é um valor real e ativo (usado por
-- app/api/leads/marketplace/route.ts ao criar cada lead do marketplace, e já
-- presente em leads existentes) que schema.sql nem sequer documenta — por
-- isso entra aqui também, para esta ser a primeira vez que a constraint é
-- criada sem partir nenhuma linha existente nem o próximo INSERT do
-- marketplace. Nunca confiar em schema.sql como fonte de verdade sem
-- confirmar contra a BD real primeiro.
alter table leads drop constraint if exists leads_status_check;
alter table leads add constraint leads_status_check
  check (status in ('novo', 'pendente', 'qualificado', 'visita', 'proposta', 'fechado', 'concluido', 'perdido'));

-- dashboard_leads() (definida em migration_marketplace_v3_atomic.sql, já
-- aplicada em produção) tem colunas fixas no RETURNS TABLE — precisa de ser
-- recriada para devolver concluido_at, senão a secção "Concluído" do quadro
-- não tem data para mostrar. Testado em produção (2026-09-23): CREATE OR
-- REPLACE sozinho falha aqui — "42P13: cannot change return type of
-- existing function ... Use DROP FUNCTION first" — porque isto muda o tipo
-- de retorno (linha OUT adicional), não só o corpo; DROP + CREATE resolve,
-- com o GRANT reaplicado a seguir (nunca fica sem ele, mesmo que só por um
-- instante dentro desta transação). concluido_at nunca revela nada sobre o
-- cliente, por isso não precisa da mesma condição lead_is_authorized() das
-- colunas de contacto acima.
drop function if exists dashboard_leads();
create function dashboard_leads()
returns table (
  id               uuid,
  status           text,
  source           text,
  locked           boolean,
  opened_at        timestamptz,
  created_at       timestamptz,
  updated_at       timestamptz,
  professional_id  uuid,
  zone_requested   text,
  specialty        text,
  q1_tipo_trabalho text,
  q2_divisoes      text,
  q3_area_m2       numeric,
  q4_cor_escura    boolean,
  q5_fissuras      boolean,
  q6_mobilias      boolean,
  q7_primer        boolean,
  q8_teto          boolean,
  q9_prazo         text,
  q10_orcamentos_anteriores boolean,
  name             text,
  phone            text,
  email            text,
  q12_notas        text,
  q11_fotos_url    text[],
  metadata         jsonb,
  concluido_at     timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    l.id, l.status, l.source, l.locked, l.opened_at, l.created_at, l.updated_at, l.professional_id,
    l.zone_requested, l.specialty,
    l.q1_tipo_trabalho, l.q2_divisoes, l.q3_area_m2, l.q4_cor_escura, l.q5_fissuras,
    l.q6_mobilias, l.q7_primer, l.q8_teto, l.q9_prazo, l.q10_orcamentos_anteriores,
    case when lead_is_authorized(l.opened_at, l.source, l.locked) then l.name  else null end,
    case when lead_is_authorized(l.opened_at, l.source, l.locked) then l.phone else null end,
    case when lead_is_authorized(l.opened_at, l.source, l.locked) then l.email else null end,
    case when lead_is_authorized(l.opened_at, l.source, l.locked) then l.q12_notas     else null end,
    case when lead_is_authorized(l.opened_at, l.source, l.locked) then l.q11_fotos_url else null end,
    case when lead_is_authorized(l.opened_at, l.source, l.locked) then l.metadata
         else (l.metadata - 'notas' - 'media_urls')
    end,
    l.concluido_at
  from leads l
  where l.professional_id in (select id from professionals where user_id = auth.uid());
$$;

grant execute on function dashboard_leads() to authenticated;
