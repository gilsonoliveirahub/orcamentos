-- Liga admin_audit_log a uma ação do Aquiles, quando a edição de um
-- profissional foi executada por ele (depois de aprovada), não por um admin
-- a clicar diretamente no painel. Nullable e aditiva — nunca altera uma
-- linha existente (todo o histórico humano fica com aquiles_action_id null,
-- exatamente como já estava). admin_id continua a ser preenchido sempre com
-- quem APROVOU (decided_by da ação), nunca fica null — a responsabilidade
-- humana final continua explícita, só se acrescenta de onde veio o pedido.

begin;

alter table public.admin_audit_log
  add column if not exists aquiles_action_id uuid references public.aquiles_pending_actions(id);

create index if not exists admin_audit_log_aquiles_action_idx on public.admin_audit_log(aquiles_action_id) where aquiles_action_id is not null;

commit;
