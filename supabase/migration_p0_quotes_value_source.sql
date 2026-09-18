-- P0 (2026-09-18): distinguir valor calculado automaticamente de valor
-- editado manualmente pelo profissional, e registar quando uma proposta foi
-- aceite pelo cliente.
--
-- NÃO EXECUTAR sem autorização explícita — este ficheiro é só para revisão.
--
-- Os registos já existentes em `quotes` nascem como 'legacy': não há forma
-- de confirmar, só pela leitura do código, se cada linha existente foi de
-- facto calculada automaticamente ou editada à mão nalgum momento anterior a
-- esta coluna existir — por isso nunca assumimos 'calculated' para dados
-- antigos sem prova. A partir da entrada em vigor do motor corrigido, todo o
-- código de escrita grava explicitamente 'calculated' (rotas /api/quote/*)
-- ou 'manual' (edição direta pelo profissional, quando essa funcionalidade
-- existir), nunca deixando o default agir para linhas novas.
alter table quotes add column if not exists value_source text not null default 'legacy'
  check (value_source in ('calculated', 'manual', 'legacy'));

alter table quotes add column if not exists accepted_at timestamptz;

comment on column quotes.value_source is
  'calculated = gerado automaticamente pelo motor de orçamentos; manual = editado pelo profissional; legacy = registo anterior a esta coluna, origem não confirmada.';
comment on column quotes.accepted_at is
  'Data em que o cliente aceitou a proposta (status = aceite). Null enquanto não aceite.';
