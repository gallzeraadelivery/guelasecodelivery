-- Fase 6: cadastro de entregadores, veículo, localização e histórico de status.

create type public.driver_status as enum (
  'OFFLINE',
  'ONLINE',
  'OFFERED',
  'BUSY',
  'TO_PICKUP',
  'AT_PICKUP',
  'DELIVERING',
  'PAUSED'
);

create table public.drivers (
  id uuid primary key references public.profiles (id) on delete cascade,
  status public.driver_status not null default 'OFFLINE',
  cpf text,
  cnh_number text,
  cnh_category text,
  kyc_status text not null default 'PENDING' check (kyc_status in ('PENDING', 'APPROVED', 'REJECTED', 'REVIEW')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.drivers is
  'Extensão de profiles para o papel driver. kyc_status só é alterado pelo backend (service_role) — nunca pelo próprio entregador.';

create index drivers_status_idx on public.drivers (status);

create table public.driver_vehicles (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers (id) on delete cascade,
  type text not null check (type in ('bike', 'motorcycle', 'car')),
  plate text,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index driver_vehicles_driver_idx on public.driver_vehicles (driver_id);

-- Uma linha por entregador com a posição mais recente (não histórico completo —
-- seção 37: throttling, sem custo de escrever a cada GPS ping em uma tabela
-- que cresce indefinidamente). Atualizada via upsert pelo próprio app.
create table public.driver_locations (
  driver_id uuid primary key references public.drivers (id) on delete cascade,
  location geography(point, 4326) not null,
  updated_at timestamptz not null default now()
);

create index driver_locations_location_idx on public.driver_locations using gist (location);

create table public.driver_status_history (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers (id) on delete cascade,
  previous_status public.driver_status,
  new_status public.driver_status not null,
  actor text not null default 'driver',
  reason text,
  created_at timestamptz not null default now()
);

create index driver_status_history_driver_idx on public.driver_status_history (driver_id);

create trigger drivers_set_updated_at
  before update on public.drivers
  for each row execute function public.set_updated_at();

create trigger driver_vehicles_set_updated_at
  before update on public.driver_vehicles
  for each row execute function public.set_updated_at();

-- Estende o trigger de novo usuário (Fase 1/3) para criar a linha em drivers
-- quando o papel for 'driver'.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name)
  values (
    new.id,
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'customer'),
    new.raw_user_meta_data ->> 'full_name'
  );

  if coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'customer') = 'customer' then
    insert into public.customers (id) values (new.id);
  elsif (new.raw_user_meta_data ->> 'role')::public.user_role = 'driver' then
    insert into public.drivers (id) values (new.id);
  end if;

  return new;
end;
$$;

-- Nunca deixar um entregador ficar ONLINE sem KYC aprovado (seção 33/34/36).
create function public.enforce_driver_kyc_gate()
returns trigger
language plpgsql
as $$
begin
  if new.status <> 'OFFLINE' and new.status <> 'PAUSED' and new.kyc_status <> 'APPROVED' then
    raise exception 'DRIVER_KYC_NOT_APPROVED';
  end if;
  return new;
end;
$$;

create trigger drivers_enforce_kyc_gate
  before insert or update of status on public.drivers
  for each row execute function public.enforce_driver_kyc_gate();

-- Audita toda mudança de status, mesmo quando feita diretamente pelo app
-- (toggle online/offline não passa pelo backend — seção 37/60).
create function public.log_driver_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status is distinct from new.status then
    insert into public.driver_status_history (driver_id, previous_status, new_status, actor)
    values (new.id, old.status, new.status, 'driver');
  end if;
  return new;
end;
$$;

create trigger drivers_log_status_change
  after update of status on public.drivers
  for each row execute function public.log_driver_status_change();

-- RLS ---------------------------------------------------------------------

alter table public.drivers enable row level security;
alter table public.driver_vehicles enable row level security;
alter table public.driver_locations enable row level security;
alter table public.driver_status_history enable row level security;

create policy "drivers_select_own" on public.drivers
  for select
  using (id = auth.uid());

create policy "drivers_update_own" on public.drivers
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- Restrição por coluna: o entregador só pode alterar status/dados cadastrais
-- básicos — kyc_status é decisão do backend, nunca do próprio usuário.
revoke update on public.drivers from authenticated;
grant update (status, cpf, cnh_number, cnh_category) on public.drivers to authenticated;

create policy "driver_vehicles_all_own" on public.driver_vehicles
  for all
  using (driver_id = auth.uid())
  with check (driver_id = auth.uid());

create policy "driver_locations_all_own" on public.driver_locations
  for all
  using (driver_id = auth.uid())
  with check (driver_id = auth.uid());

create policy "driver_status_history_select_own" on public.driver_status_history
  for select
  using (driver_id = auth.uid());
