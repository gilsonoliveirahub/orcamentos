-- Fase 2 do plano 2026-09-15, decisão de negócio (2026-09-16): profissões
-- "por hora" (Canalização, Electricidade, Limpeza, Ar Condicionado, Mudanças,
-- Carpintaria) não perguntam ao cliente quantas horas o trabalho leva — o
-- profissional indica as horas estimadas no rascunho da proposta
-- (app/leads/[id]/page.tsx → app/api/quote/hours/route.ts), que calcula
-- price_per_hour × horas, respeitando min_quote.
--
-- NÃO APLICADO em produção — ficheiro só criado localmente, a aplicar
-- manualmente (Supabase SQL Editor), com aprovação explícita antes de correr.

alter table quotes add column if not exists horas_estimadas numeric;
