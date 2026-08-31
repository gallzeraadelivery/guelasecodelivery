-- Fase 1: configurações administrativas versionadas (sem deploy) + histórico de alterações.
-- Nenhum valor financeiro/operacional relevante deve ser hardcoded no código; tudo lido daqui.
-- Pedidos guardam um snapshot da configuração vigente no momento (Fase 4+) — alterar uma
-- linha aqui nunca deve mudar retroativamente um pedido já criado.

create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

create table public.setting_history (
  id uuid primary key default gen_random_uuid(),
  setting_key text not null,
  old_value jsonb,
  new_value jsonb not null,
  changed_by uuid references public.profiles (id) on delete set null,
  changed_at timestamptz not null default now()
);

create index setting_history_key_idx on public.setting_history (setting_key, changed_at);

-- RLS: nenhuma policy para roles de cliente/parceiro/entregador — apenas a
-- service_role (usada exclusivamente pelo backend) pode ler/escrever.
alter table public.platform_settings enable row level security;
alter table public.setting_history enable row level security;

create function public.log_platform_setting_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.setting_history (setting_key, old_value, new_value, changed_by)
  values (
    new.key,
    case when tg_op = 'UPDATE' then old.value else null end,
    new.value,
    new.updated_by
  );
  return new;
end;
$$;

create trigger platform_settings_log_change
  after insert or update on public.platform_settings
  for each row execute function public.log_platform_setting_change();

create trigger platform_settings_set_updated_at
  before update on public.platform_settings
  for each row execute function public.set_updated_at();

-- Seed: valores de EXEMPLO/placeholder, a serem revisados pela administração antes do
-- lançamento. Nenhum deles deve ser tratado como decisão comercial definitiva.
insert into public.platform_settings (key, value, description) values
  (
    'inventory_reservation_expiration_minutes',
    '10',
    'Minutos até uma reserva de estoque PENDING expirar automaticamente e voltar ao disponível.'
  ),
  (
    'platform_service_fee',
    '{"type": "fixed", "amount_cents": 199, "min_cents": null, "max_cents": null}',
    'PLACEHOLDER — taxa de serviço cobrada do cliente. Estrutura suporta fixa, percentual ou combinada; valor de exemplo, não definitivo (ver seção 24/62 do documento de arquitetura).'
  ),
  (
    'fulfillment_algorithm_version',
    '"v1-best-eta"',
    'Versão do algoritmo de seleção de distribuidora em uso, salva em cada pedido para auditoria.'
  );
