-- Fase 2: distribuidoras, equipe da distribuidora, área de atendimento,
-- ofertas sobre o catálogo mestre (partner_products) e estoque.

create type public.partner_status as enum (
  'ONLINE',
  'OFFLINE',
  'PAUSED',
  'CLOSED',
  'BLOCKED'
);

create type public.partner_user_role as enum ('owner', 'staff');

create table public.partners (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  trade_name text not null,
  document text unique,
  status public.partner_status not null default 'OFFLINE',
  address_line text,
  location geography(point, 4326),
  mercadopago_account_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index partners_status_idx on public.partners (status);
create index partners_location_idx on public.partners using gist (location);

-- Vínculo entre um usuário autenticado (profiles/auth.users) e a distribuidora que
-- ele opera. Onboarding de distribuidora e do primeiro partner_user é feito pela
-- administração GUELA SECO (service_role) no MVP — não há self-signup de distribuidora.
create table public.partner_users (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  partner_id uuid not null references public.partners (id) on delete cascade,
  role public.partner_user_role not null default 'staff',
  created_at timestamptz not null default now(),
  unique (profile_id, partner_id)
);

create index partner_users_partner_idx on public.partner_users (partner_id);

create table public.partner_hours (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  opens_at time not null,
  closes_at time not null,
  check (closes_at > opens_at)
);

create index partner_hours_partner_idx on public.partner_hours (partner_id);

-- Área de atendimento como raio simples (custo geoespacial baixo). Evolução para
-- polígono fica para quando houver necessidade real (ver seção 9 da arquitetura).
create table public.service_areas (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id) on delete cascade,
  center geography(point, 4326) not null,
  radius_km numeric(6, 2) not null check (radius_km > 0),
  created_at timestamptz not null default now()
);

create index service_areas_partner_idx on public.service_areas (partner_id);
create index service_areas_center_idx on public.service_areas using gist (center);

-- Oferta de uma distribuidora sobre um produto do catálogo mestre.
create table public.partner_products (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id) on delete cascade,
  catalog_product_id uuid not null references public.catalog_products (id) on delete cascade,
  price_cents bigint not null check (price_cents >= 0),
  promotional_price_cents bigint check (promotional_price_cents >= 0),
  partner_sku text,
  available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (partner_id, catalog_product_id)
);

create index partner_products_partner_idx on public.partner_products (partner_id);
create index partner_products_catalog_idx on public.partner_products (catalog_product_id);

-- Estoque físico da oferta. reserved_quantity é preparado desde já (Fase 4 passa a
-- escrever nela via reserva transacional no checkout) mas neste momento só
-- stock_quantity é gerenciado pelo painel parceiro.
create table public.inventory (
  id uuid primary key default gen_random_uuid(),
  partner_product_id uuid not null unique references public.partner_products (id) on delete cascade,
  stock_quantity int not null default 0 check (stock_quantity >= 0),
  reserved_quantity int not null default 0 check (reserved_quantity >= 0),
  updated_at timestamptz not null default now(),
  check (reserved_quantity <= stock_quantity)
);

create trigger partners_set_updated_at
  before update on public.partners
  for each row execute function public.set_updated_at();

create trigger partner_products_set_updated_at
  before update on public.partner_products
  for each row execute function public.set_updated_at();

create trigger inventory_set_updated_at
  before update on public.inventory
  for each row execute function public.set_updated_at();

-- Cria a linha de estoque (zerada) automaticamente quando uma oferta é criada, para
-- que o painel parceiro sempre tenha uma linha de inventory para editar.
create function public.handle_new_partner_product()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.inventory (partner_product_id, stock_quantity)
  values (new.id, 0);
  return new;
end;
$$;

create trigger partner_products_create_inventory
  after insert on public.partner_products
  for each row execute function public.handle_new_partner_product();

-- RLS ---------------------------------------------------------------------

alter table public.partners enable row level security;
alter table public.partner_users enable row level security;
alter table public.partner_hours enable row level security;
alter table public.service_areas enable row level security;
alter table public.partner_products enable row level security;
alter table public.inventory enable row level security;

-- security definer para evitar recursão de RLS ao checar associação com a
-- distribuidora a partir de policies de outras tabelas.
create function public.is_partner_member(p_partner_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.partner_users
    where partner_id = p_partner_id
      and profile_id = auth.uid()
  );
$$;

create function public.is_partner_owner(p_partner_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.partner_users
    where partner_id = p_partner_id
      and profile_id = auth.uid()
      and role = 'owner'
  );
$$;

-- partners: membros leem a própria distribuidora; apenas o owner edita. Criação e
-- remoção de distribuidora ficam com a service_role (onboarding pela administração).
create policy "partners_select_own" on public.partners
  for select
  using (public.is_partner_member(id));

create policy "partners_update_owner" on public.partners
  for update
  using (public.is_partner_owner(id))
  with check (public.is_partner_owner(id));

-- partner_users: cada pessoa só enxerga o próprio vínculo. Gestão de equipe
-- (convidar/remover staff) fica com a service_role no MVP.
create policy "partner_users_select_own" on public.partner_users
  for select
  using (profile_id = auth.uid());

-- partner_hours / service_areas / partner_products: CRUD completo para membros da
-- própria distribuidora.
create policy "partner_hours_all_own" on public.partner_hours
  for all
  using (public.is_partner_member(partner_id))
  with check (public.is_partner_member(partner_id));

create policy "service_areas_all_own" on public.service_areas
  for all
  using (public.is_partner_member(partner_id))
  with check (public.is_partner_member(partner_id));

create policy "partner_products_all_own" on public.partner_products
  for all
  using (public.is_partner_member(partner_id))
  with check (public.is_partner_member(partner_id));

-- inventory: acesso via o partner_id da oferta associada.
create policy "inventory_all_own" on public.inventory
  for all
  using (
    exists (
      select 1 from public.partner_products pp
      where pp.id = inventory.partner_product_id
        and public.is_partner_member(pp.partner_id)
    )
  )
  with check (
    exists (
      select 1 from public.partner_products pp
      where pp.id = inventory.partner_product_id
        and public.is_partner_member(pp.partner_id)
    )
  );
