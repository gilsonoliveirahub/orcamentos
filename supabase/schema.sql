-- Tabela de Profissionais (configuração do pintor)
create table if not exists professionals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  specialty text default 'Pintura',
  phone text,
  -- Preços base
  price_m2_walls numeric default 4.00,
  price_m2_ceiling numeric default 5.00,
  price_m2_exterior numeric default 6.00,
  -- Extras
  extra_dark_color numeric default 1.25, -- multiplicador 25%
  extra_cracks numeric default 6.00,     -- €/m2
  extra_furniture_move numeric default 50.00, -- €/divisão
  extra_primer numeric default 2.00,     -- €/m2
  -- Mínimos
  min_quote numeric default 150.00,
  created_at timestamptz default now()
);

-- Tabela de Leads
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  name text,
  phone text not null,
  status text default 'novo' check (status in ('novo', 'qualificado', 'visita', 'proposta', 'fechado', 'perdido')),
  -- Respostas às 12 perguntas
  q1_tipo_trabalho text,       -- interior/exterior/ambos
  q2_divisoes text,            -- lista de divisões
  q3_area_m2 numeric,          -- m2 estimados
  q4_cor_escura boolean,       -- cor escura?
  q5_fissuras boolean,         -- tem fissuras?
  q6_mobilias boolean,         -- tem móveis para mover?
  q7_primer boolean,           -- precisa de primário?
  q8_teto boolean,             -- inclui teto?
  q9_prazo text,               -- urgência
  q10_orcamentos_anteriores boolean, -- já pediu outros orçamentos?
  q11_fotos_url text[],        -- URLs das fotos
  q12_notas text,              -- notas adicionais
  -- Meta
  current_question int default 1,
  professional_id uuid references professionals(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Tabela de Orçamentos
create table if not exists quotes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete cascade,
  professional_id uuid references professionals(id),
  -- Cálculo
  area_m2 numeric,
  valor_base numeric,
  extras_total numeric,
  valor_final numeric,
  valor_min numeric,
  valor_max numeric,
  -- Texto gerado
  proposal_text text,
  -- Follow-up
  sent_at timestamptz,
  followup_d2_sent boolean default false,
  followup_d5_sent boolean default false,
  -- Estado
  status text default 'rascunho' check (status in ('rascunho', 'enviado', 'aceite', 'recusado')),
  created_at timestamptz default now()
);

-- Inserir profissional padrão (Gilson)
insert into professionals (name, specialty, phone)
values ('Gilson Oliveira', 'Pintura', '351000000000')
on conflict do nothing;

-- Índices
create index if not exists leads_phone_idx on leads(phone);
create index if not exists leads_status_idx on leads(status);
create index if not exists quotes_lead_id_idx on quotes(lead_id);
