-- Consentimento de marketing — DOIS PÚBLICOS SEPARADOS, nunca partilham
-- tabela/coluna/mecanismo de cancelamento:
--   1. CLIENTES — quem pede orçamentos via /pedir e /p/[slug] (sem conta,
--      identificados por email). Prioridade principal deste pedido.
--   2. PROFISSIONAIS — utilizadores com conta na plataforma.
--
-- NÃO EXECUTAR EM PRODUÇÃO SEM AUTORIZAÇÃO FINAL.
-- Não cria nem envia nenhuma campanha — só a infraestrutura de consentimento
-- e cancelamento.

-- ════════════════════════════════════════════════════════════════════════
-- 1. CLIENTES
-- ════════════════════════════════════════════════════════════════════════

-- Registo do consentimento tal como foi dado NESTE pedido específico —
-- histórico/auditoria, não é a fonte de verdade sobre se podemos enviar.
alter table leads add column if not exists marketing_opt_in boolean not null default false;
alter table leads add column if not exists marketing_opt_in_at timestamptz;
alter table leads add column if not exists marketing_consent_version text;
alter table leads add column if not exists marketing_consent_source text
  check (marketing_consent_source in ('pedir', 'p_slug'));

-- Fonte de verdade por email — é esta tabela que qualquer envio futuro tem de
-- consultar antes de mandar uma campanha. Um único email pode estar associado
-- a vários leads ao longo do tempo; cancelar tem de bloquear TODOS os envios
-- futuros para esse email, não só o lead que originou o link de cancelamento.
-- Por isso não basta o campo em "leads" — teria de se cruzar todos os leads
-- do mesmo email a cada envio, e um opt-out não conseguiria "vencer" um
-- opt-in antigo de outro lead com o mesmo email de forma simples.
create table if not exists marketing_consents (
  id                uuid primary key default gen_random_uuid(),
  email             text not null unique,
  -- email sempre normalizado (lowercase, trim) antes de gravar/consultar
  opted_in          boolean not null default false,
  opted_in_at       timestamptz,
  opted_out_at      timestamptz,
  consent_version   text,
  consent_source    text check (consent_source in ('pedir', 'p_slug')),
  lead_id           uuid references leads(id) on delete set null,
  -- último lead que originou o consentimento (só para rastreabilidade,
  -- não é usado para autorizar/bloquear envios)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists marketing_consents_email_idx on marketing_consents (email);

alter table marketing_consents enable row level security;
-- Sem políticas para anon/authenticated — mesmo padrão do sistema de
-- métricas: só service_role lê/escreve, a partir de rotas server-side com a
-- sua própria autorização (/api/leads/public, /api/leads/marketplace,
-- /api/marketing/opt-out).

-- ════════════════════════════════════════════════════════════════════════
-- 2. PROFISSIONAIS (separado dos clientes — tabela e mecanismo diferentes)
-- ════════════════════════════════════════════════════════════════════════

-- Profissional é um utilizador com conta — o consentimento vive diretamente
-- na sua própria linha, não precisa de tabela de suporte por email como os
-- clientes (não há múltiplas "leads" de profissional com o mesmo email a
-- desalinhar o estado).
alter table professionals add column if not exists marketing_opt_in boolean not null default false;
