-- Bug encontrado no lead da Elisa Reuter (2026-09-16): app/api/quote/generate
-- e app/api/quote/estimate faziam `.upsert({...})` sem `onConflict`, e como
-- nenhum `id` era passado no payload, o Supabase tratava cada chamada como um
-- INSERT novo em vez de atualizar a proposta existente do lead. Cada clique
-- em "+ Orçamento" no dashboard criava uma linha nova em `quotes` — chegaram
-- a existir 9 linhas idênticas para o mesmo lead, inflacionando "Potencial
-- este mês" (soma de todas as linhas, sem agrupar por lead) 9x acima do real.
--
-- Este constraint impede a repetição ao nível da BD (linha de defesa real);
-- o código em app/api/quote/generate/route.ts e app/api/quote/estimate/route.ts
-- já foi corrigido para `.upsert({...}, { onConflict: 'lead_id' })`, que passa
-- a atualizar a proposta existente em vez de duplicar.
--
-- Pré-requisito: não pode haver leads com mais do que uma quote antes de
-- aplicar isto (falha com erro de duplicate key). Confirmado em 2026-09-16
-- que só o lead da Elisa Reuter tinha duplicados (9 linhas) — limpar essas
-- primeiro (mantendo 1) antes de correr este ficheiro.
--
-- NÃO APLICADO em produção — ficheiro só criado localmente, a aplicar
-- manualmente (Supabase SQL Editor), com aprovação explícita antes de correr.

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'quotes_lead_id_unique'
  ) then
    alter table quotes add constraint quotes_lead_id_unique unique (lead_id);
  end if;
end $$;
