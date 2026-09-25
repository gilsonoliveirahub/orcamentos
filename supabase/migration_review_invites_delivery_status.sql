-- Estado real de entrega dos convites de avaliação (2026-09-25) — distingue
-- "pedido criado" (review_invites.status) de "mensagem entregue"/"falhou"
-- (colunas novas abaixo). Também prepara o envio por WhatsApp para usar o
-- modelo aprovado pela Meta em vez de texto livre — ver
-- lib/send-review-invite.ts e app/api/webhook/twilio-status/route.ts.
--
-- NÃO EXECUTAR EM PRODUÇÃO SEM AUTORIZAÇÃO FINAL — preparado localmente,
-- só aplicar depois de aprovação explícita.

alter table review_invites add column if not exists send_status text
  check (send_status in ('sending', 'sent', 'delivered', 'failed'));
-- null = nunca se tentou enviar (ex: ainda em 'requested', por confirmar).
-- 'sending' = lock atómico transitório enquanto um reenvio está em curso
-- (ver PATCH .../[id] ação 'resend') — nunca fica preso aí: resolve sempre
-- para 'sent' ou 'failed' antes da resposta ao profissional.

alter table review_invites add column if not exists send_error text;
-- código/motivo da falha, só quando send_status = 'failed'. Nunca o corpo
-- da mensagem nem dados do cliente.

alter table review_invites add column if not exists whatsapp_message_sid text;
-- SID da mensagem na Twilio — só canal whatsapp, usado pelo status
-- callback (app/api/webhook/twilio-status/route.ts) para encontrar a que
-- convite pertence uma atualização de estado que chega depois, assíncrona.

alter table review_invites add column if not exists send_status_updated_at timestamptz;

create index if not exists review_invites_whatsapp_message_sid_idx
  on review_invites (whatsapp_message_sid) where whatsapp_message_sid is not null;
