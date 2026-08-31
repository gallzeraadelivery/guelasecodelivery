-- Fase 2: catálogo mestre do marketplace (independente de qualquer distribuidora).
-- Distribuidoras "assinam" itens deste catálogo através de partner_products (migration seguinte).

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  parent_id uuid references public.categories (id) on delete set null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index categories_parent_idx on public.categories (parent_id);

create table public.catalog_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text,
  description text,
  category_id uuid references public.categories (id) on delete set null,
  image_url text,
  barcode text,
  unit text not null default 'un',
  volume_ml int,
  alcohol_content_pct numeric(4, 1),
  requires_age_verification boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index catalog_products_category_idx on public.catalog_products (category_id);
create index catalog_products_name_idx on public.catalog_products using gin (to_tsvector('portuguese', name));

comment on column public.catalog_products.requires_age_verification is
  'Default true por segurança — produtos claramente não-alcoólicos devem marcar false explicitamente na curadoria do catálogo.';

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

create trigger catalog_products_set_updated_at
  before update on public.catalog_products
  for each row execute function public.set_updated_at();

-- RLS ---------------------------------------------------------------------
-- O catálogo mestre é curadoria centralizada do GUELA SECO (não self-service por
-- distribuidora), por isso não há policy de escrita para roles de app — apenas a
-- service_role grava. Leitura de itens ativos é pública (necessário para o cliente
-- navegar o catálogo a partir da Fase 3, e inofensivo pois não há dado sensível aqui).

alter table public.categories enable row level security;
alter table public.catalog_products enable row level security;

create policy "categories_public_read_active" on public.categories
  for select
  using (active = true);

create policy "catalog_products_public_read_active" on public.catalog_products
  for select
  using (active = true);
