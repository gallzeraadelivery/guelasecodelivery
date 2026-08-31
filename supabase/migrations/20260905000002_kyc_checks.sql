-- Fase 6: verificações de KYC do entregador (seção 33).
-- Escrita exclusiva do backend (service_role) — resultado de KYC nunca pode
-- vir do app do entregador.

create table public.kyc_checks (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers (id) on delete cascade,
  provider text not null default 'bitcoinp2p',
  external_check_id text,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED', 'REVIEW')),
  checks jsonb,
  raw_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index kyc_checks_driver_idx on public.kyc_checks (driver_id, created_at desc);

create trigger kyc_checks_set_updated_at
  before update on public.kyc_checks
  for each row execute function public.set_updated_at();

-- Mantém drivers.kyc_status sempre sincronizado com o resultado mais recente,
-- sem depender do backend lembrar de atualizar as duas tabelas.
create function public.sync_driver_kyc_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.drivers
  set kyc_status = new.status
  where id = new.driver_id;
  return new;
end;
$$;

create trigger kyc_checks_sync_driver_status
  after insert or update of status on public.kyc_checks
  for each row execute function public.sync_driver_kyc_status();

-- RLS ---------------------------------------------------------------------

alter table public.kyc_checks enable row level security;

create policy "kyc_checks_select_own" on public.kyc_checks
  for select
  using (driver_id = auth.uid());

-- Sem policy de insert/update: só service_role grava.
