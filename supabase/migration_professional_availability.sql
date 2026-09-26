-- Disponibilidade avançada do profissional (2026-09-25): "parcialmente
-- disponível" e "disponível a partir de uma data", além do já existente
-- disponível/indisponível (accepting_leads). Ver lib/professional-availability.ts
-- para a lógica de leitura (nunca ajusta accepting_leads sozinho por cron —
-- o efeito de available_from já passada é só calculado, não escrito).
--
-- NÃO EXECUTAR EM PRODUÇÃO SEM AUTORIZAÇÃO FINAL — preparado localmente,
-- só aplicar depois de aprovação explícita.

alter table professionals add column if not exists availability_status text
  default 'disponivel' check (availability_status in ('disponivel', 'parcial', 'indisponivel'));

-- Só usada quando availability_status = 'indisponivel' — data em que volta a
-- ficar disponível. Nunca obrigatória (indisponível sem data conhecida
-- continua válido, só não mostra "a partir de X").
alter table professionals add column if not exists available_from date;

-- accepting_leads (coluna já existente) fica sempre em sincronia por
-- aplicação (ver app/perfil/page.tsx) — não é derivada aqui por trigger de
-- propósito: mais simples de raciocinar sobre uma única escrita explícita
-- por pedido do profissional do que um trigger escondido.
