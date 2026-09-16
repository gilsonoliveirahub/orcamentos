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
-- NÃO APLICADO em produção — ficheiro só criado localmente, a aplicar
-- manualmente (Supabase SQL Editor), com aprovação explícita antes de correr.

create table if not exists notification_log (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid references leads(id) on delete cascade,
  professional_id uuid references professionals(id),
  channel         text not null check (channel in ('email', 'whatsapp')),
  status          text not null check (status in ('sent', 'failed', 'skipped')),
  reason          text,
  created_at      timestamptz not null default now()
);

create index if not exists notification_log_professional_id_idx on notification_log(professional_id);
create index if not exists notification_log_lead_id_idx on notification_log(lead_id);

alter table notification_log enable row level security;

-- Só leitura via service_role por agora (mesmo padrão de admin_audit_log) —
-- sem policy pública. A escrita em app/api/notifications/lead/route.ts é
-- sempre via supabaseAdmin (service_role, ignora RLS).
