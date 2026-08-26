-- Tópico "Matching inteligente" (2026-08-26) — permite ao profissional
-- pausar-se a si próprio para não adquirir mais pedidos do marketplace, sem
-- ter de desativar a conta (`active`, que é um campo de moderação do admin,
-- não do próprio profissional — ver app/api/admin/professionals/[id]/route.ts).
--
-- Nullable seria ambíguo (undefined/null teria de significar "disponível"
-- por omissão); not null + default true evita essa ambiguidade logo na BD e
-- mantém o comportamento atual (todos disponíveis) para todas as contas
-- existentes, sem exceção.
--
-- Só gate de aquisição no marketplace (lib/marketplace.ts,
-- acquireMarketplaceLead) — não esconde o perfil público (/p/[slug]), não
-- afeta o link pessoal, não é um campo de moderação.
--
-- NÃO APLICADO em produção — ficheiro só criado localmente, a aplicar
-- manualmente mais tarde (mesmo fluxo dos restantes migration_*.sql deste
-- repositório).

alter table professionals add column if not exists accepting_leads boolean not null default true;
