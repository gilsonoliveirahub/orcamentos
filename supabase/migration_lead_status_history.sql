-- Percurso dos leads (2026-09-24) — histórico de mudanças de estado, para o
-- admin conseguir ver quanto tempo cada lead demora a avançar (novo →
-- qualificado → visita → proposta → fechado/perdido), não só o estado atual.
--
-- NÃO EXECUTAR EM PRODUÇÃO SEM AUTORIZAÇÃO FINAL — preparado localmente,
-- só aplicar depois de aprovação explícita (mesmo fluxo dos restantes
-- migration_*.sql deste repositório).
--
-- Só a tabela + índices aqui. A escrita fica em app/api/leads/status/route.ts
-- (lib/lead-status-history.ts), melhor esforço — uma falha ao registar o
-- histórico nunca pode bloquear nem reverter a mudança de estado real do
-- lead, que já está gravada antes desta chamada.

create table if not exists lead_status_history (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid not null references leads(id) on delete cascade,
  from_status  text,
  to_status    text not null,
  changed_by   uuid references professionals(id) on delete set null,
  changed_at   timestamptz not null default now()
);

create index if not exists lead_status_history_lead_idx on lead_status_history (lead_id, changed_at);

alter table lead_status_history enable row level security;
-- Sem policies para anon/authenticated — só service_role escreve/lê (mesmo
-- padrão de analytics_events), a rota admin usa supabaseAdmin.
