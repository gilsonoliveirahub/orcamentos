-- NÃO EXECUTAR EM PRODUÇÃO SEM AUTORIZAÇÃO FINAL — este ficheiro é preparado
-- localmente e só é aplicado à base de dados depois de aprovação explícita
-- (aplicação manual via Supabase Studio, como as restantes migrações).
--
-- Bug encontrado na auditoria de preparação para medir campanhas pagas:
-- lib/analytics.ts define ORIGIN_CHANNELS incluindo 'ia' (usado pela função
-- normalizeOriginChannel para classificar visitas vindas de chat.openai.com,
-- chatgpt.com, claude.ai, gemini.google.com, perplexity.ai, copilot.microsoft.com,
-- you.com, ou de utm_source contendo esses nomes — ver AI Visibility KPI).
--
-- Mas o CHECK constraint original de analytics_events.origin_channel e
-- analytics_daily_summary.origin_channel (migration_analytics.sql) nunca
-- incluiu 'ia' na lista de valores permitidos. Nas duas tabelas, qualquer
-- evento cujo origin_channel calculado seja 'ia' falha silenciosamente o
-- INSERT (a rota /api/track e recordRequestCompleted engolem o erro e devolvem
-- sucesso ao browser) — ou seja, hoje, na produção, o tráfego vindo de IA/
-- referência nunca chega a ficar registado. Isto tem impacto direto na
-- preparação de medição de campanhas: um dos canais que se pretende conseguir
-- distinguir no futuro (IA/referência) está a ser descartado sem aviso.

alter table analytics_events drop constraint if exists analytics_events_origin_channel_check;
alter table analytics_events add constraint analytics_events_origin_channel_check
  check (origin_channel in ('facebook', 'instagram', 'whatsapp', 'google', 'ia', 'direto', 'outro'));

alter table analytics_daily_summary drop constraint if exists analytics_daily_summary_origin_channel_check;
alter table analytics_daily_summary add constraint analytics_daily_summary_origin_channel_check
  check (origin_channel in ('facebook', 'instagram', 'whatsapp', 'google', 'ia', 'direto', 'outro'));
