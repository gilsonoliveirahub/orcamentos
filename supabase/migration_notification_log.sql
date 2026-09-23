-- Bug encontrado no lead da Elisa Reuter (2026-09-16): app/api/notifications/lead
-- tentava enviar email (Resend) e WhatsApp (Twilio) mas qualquer falha ficava
-- só num console.warn/console.error — nunca visível para o profissional nem
-- persistida. Confirmado nesse caso que o domínio de email nunca esteve
-- verificado na Resend (falha silenciosa desde 2026-04-21, nenhum email
-- alguma vez saiu) e não havia forma de saber isso sem investigar a fundo.
--
-- Esta tabela regista cada tentativa de notificação (sucesso ou falha) para
-- se poder diagnosticar isto sem depender dos logs efémeros do Vercel.
--
-- ATUALIZAÇÃO (2026-09-23, verificado por leitura direta à produção antes de
-- aplicar): ao contrário do que este comentário dizia, a tabela já estava
-- aplicada (id/lead_id/professional_id/channel/status/reason/created_at,
-- índices e RLS incluídos) — só faltava a coluna 'kind' abaixo. O bloco
-- CREATE TABLE/índices/RLS abaixo fica como estava (idempotente, serve
-- também para instalações novas); a coluna 'kind' precisa de um ALTER TABLE
-- à parte porque "CREATE TABLE IF NOT EXISTS" não toca numa tabela que já
-- existe, mesmo que o corpo tenha uma coluna nova.

create table if not exists notification_log (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid references leads(id) on delete cascade,
  professional_id uuid references professionals(id),
  channel         text not null check (channel in ('email', 'whatsapp')),
  status          text not null check (status in ('sent', 'failed', 'skipped')),
  reason          text,
  kind            text not null default 'lead_notification' check (kind in ('lead_notification', 'review_request')),
  created_at      timestamptz not null default now()
);

create index if not exists notification_log_professional_id_idx on notification_log(professional_id);
create index if not exists notification_log_lead_id_idx on notification_log(lead_id);

alter table notification_log enable row level security;

-- 'kind' (2026-09-23): distingue o QUE está a ser notificado, não só o
-- canal — sem isto, a verificação de "já enviado" do pedido de opinião
-- (kind='review_request', ver lib/complete-lead.ts) não conseguia
-- distinguir-se de um registo de canal='email' deixado pela notificação de
-- "novo lead" (kind='lead_notification') para o mesmo lead_id, e confundia
-- as duas como se fossem o mesmo envio. ALTER separado (não só a coluna
-- dentro do CREATE TABLE acima) porque a tabela já existia em produção.
alter table notification_log add column if not exists kind text not null default 'lead_notification';
alter table notification_log drop constraint if exists notification_log_kind_check;
alter table notification_log add constraint notification_log_kind_check
  check (kind in ('lead_notification', 'review_request'));

-- Só leitura via service_role por agora (mesmo padrão de admin_audit_log) —
-- sem policy pública. A escrita em app/api/notifications/lead/route.ts é
-- sempre via supabaseAdmin (service_role, ignora RLS).
