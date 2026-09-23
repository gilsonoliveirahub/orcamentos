-- Convites de avaliação para trabalhos feitos FORA do FaçoPorTi (2026-09-23):
-- o profissional convida um cliente por email OU WhatsApp, sem precisar de
-- criar um pedido fictício em `leads` só para poder ligar uma avaliação a
-- ele. Um dos dois canais é sempre obrigatório, nunca os dois em simultâneo
-- no mesmo convite (decisão de negócio, 2026-09-23) — ver constraint abaixo.
--
-- NÃO APLICADO em produção — ficheiro só criado localmente, a aplicar
-- manualmente mais tarde (mesmo fluxo dos restantes migration_*.sql deste
-- repositório), só depois de aprovação explícita. Nenhum convite real foi
-- enviado nesta fase.

create table if not exists review_invites (
  id              uuid primary key default gen_random_uuid(),
  professional_id uuid not null references professionals(id) on delete cascade,
  client_name     text not null,
  channel         text not null check (channel in ('email', 'whatsapp')),
  client_email    text,
  client_phone    text,
  status          text not null default 'pending' check (status in ('pending', 'completed')),
  created_at      timestamptz not null default now(),
  completed_at    timestamptz
);

-- Exatamente o campo do canal escolhido preenchido, nunca os dois nem
-- nenhum — evita um convite "email" sem email, ou um com os dois canais ao
-- mesmo tempo que nunca foi pedido.
alter table review_invites drop constraint if exists review_invites_channel_field_check;
alter table review_invites add constraint review_invites_channel_field_check
  check (
    (channel = 'email'    and client_email is not null and client_phone is null) or
    (channel = 'whatsapp' and client_phone is not null and client_email is null)
  );

create index if not exists review_invites_professional_id_idx on review_invites(professional_id);

-- Impede um 2º convite PENDENTE para o mesmo contacto do mesmo profissional
-- — índice parcial (só sobre status='pending'), por isso não bloqueia um
-- novo convite depois do anterior estar concluído (ex: mesmo cliente,
-- trabalho diferente, mais tarde). coalesce(email, telefone) para o
-- convite continuar único por CONTACTO, independentemente de mudar de
-- canal entre convites; lower() no email para não depender de
-- maiúsculas/minúsculas.
drop index if exists review_invites_pending_email_unique;
create unique index if not exists review_invites_pending_contact_unique
  on review_invites (professional_id, coalesce(lower(client_email), client_phone))
  where status = 'pending';

alter table review_invites enable row level security;

-- Sem policy pública — toda a leitura/escrita passa por rotas server-side
-- (supabaseAdmin, service_role, ignora RLS): criação/listagem só para o
-- profissional dono (autenticado), leitura do convite individual só com
-- token válido (ver app/api/review-invites/route.ts e [id]/route.ts).

-- ── reviews: liga-se a um convite em vez de um lead ─────────────────────────
alter table reviews add column if not exists invite_id uuid references review_invites(id) on delete set null;

-- 'plataforma' = pedido feito no FaçoPorTi (lead_id preenchido, como sempre
-- foi); 'convidado' = trabalho fora da plataforma, convite direto por email
-- (invite_id preenchido). Nunca os dois em simultâneo — ver constraint XOR
-- abaixo — e é este campo que decide o rótulo "Cliente convidado pelo
-- profissional" no perfil público (nunca inferido de outra forma).
alter table reviews add column if not exists source text not null default 'plataforma' check (source in ('plataforma', 'convidado'));

alter table reviews drop constraint if exists reviews_invite_id_unique;
alter table reviews add constraint reviews_invite_id_unique unique (invite_id);

-- XOR: exatamente um de lead_id/invite_id preenchido, nunca os dois nem
-- nenhum — evita uma review "órfã" sem se perceber a que fluxo pertence.
alter table reviews drop constraint if exists reviews_lead_or_invite_check;
alter table reviews add constraint reviews_lead_or_invite_check
  check ((lead_id is not null) <> (invite_id is not null));
