-- Fase 3: perfil de cliente e endereços de entrega.

create table public.customers (
  id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.customers is
  'Extensão de profiles para o papel customer. Criada automaticamente ao nascer um usuário com role=customer.';

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  label text,
  address_line text not null,
  number text,
  complement text,
  neighborhood text,
  city text not null default 'Cuiabá',
  state text not null default 'MT',
  postal_code text,
  location geography(point, 4326),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index addresses_customer_idx on public.addresses (customer_id);
create index addresses_location_idx on public.addresses using gist (location);

create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

create trigger addresses_set_updated_at
  before update on public.addresses
  for each row execute function public.set_updated_at();

-- Estende o trigger de criação de usuário (Fase 1) para também criar a linha em
-- customers quando o papel for 'customer'.
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
  end if;

  return new;
end;
$$;

-- RLS ---------------------------------------------------------------------

alter table public.customers enable row level security;
alter table public.addresses enable row level security;

create policy "customers_select_own" on public.customers
  for select
  using (id = auth.uid());

create policy "addresses_all_own" on public.addresses
  for all
  using (customer_id = auth.uid())
  with check (customer_id = auth.uid());
