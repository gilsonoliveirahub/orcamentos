-- Marketplace com aquisição ativa (sem atribuição automática) + limites de
-- ciclo do link pessoal + correspondência por distância aproximada.
-- Aplicado em produção (projeto facoporti) em 2026-07-17.
--
-- Não altera nem redistribui nenhum lead existente — só acrescenta colunas
-- (todas nullable, sem default que mude o comportamento de linhas antigas).

-- Coordenadas aproximadas do PEDIDO (nível de localidade/distrito, nunca
-- morada exata), calculadas e gravadas no servidor no momento da criação do
-- lead, a partir de zone_requested. Nulo = zona não reconhecida na tabela
-- estática ou lead anterior a esta funcionalidade — nesses casos usa-se o
-- fallback por correspondência de texto de zona.
--
-- As coordenadas do PROFISSIONAL não são persistidas — são recalculadas a
-- partir de professionals.zone em tempo real sempre que necessário (é uma
-- tabela estática, sem custo nem latência, e evita ficarem desatualizadas
-- se o profissional mudar de zona sem um caminho de escrita dedicado).
alter table leads add column if not exists lat numeric;
alter table leads add column if not exists lng numeric;

-- Primeira abertura de um lead do link pessoal — é este momento que consome
-- 1 unidade da quota do ciclo (10 Starter / 30 Pro), nunca a criação do
-- lead. Uma vez definido, o lead fica permanentemente acessível.
alter table leads add column if not exists opened_at timestamptz;

create index if not exists leads_opened_at_idx on leads (professional_id, source, opened_at);
