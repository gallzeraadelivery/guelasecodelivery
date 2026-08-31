-- Fase 1: extensões, papéis de usuário, perfis e auditoria base.

create extension if not exists "pgcrypto";
create extension if not exists "postgis";

create type public.user_role as enum (
  'customer',
  'partner_user',
  'driver',
  'admin'
);

-- Um perfil por usuário do Supabase Auth, carregando o papel dentro da plataforma.
-- Dados específicos de cada papel (customers, partner_users, drivers) vivem em
-- tabelas próprias criadas nas fases em que esses papéis passam a existir.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null,
  full_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Identidade + papel de cada usuário autenticado. Dados de negócio específicos do papel ficam em tabelas dedicadas.';

create index profiles_role_idx on public.profiles (role);

-- Log de auditoria imutável para operações administrativas/financeiras sensíveis.
-- Escrita exclusiva do backend (service_role) — nunca exposto a clientes via RLS.
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  actor_role public.user_role,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_logs_created_at_idx on public.audit_logs (created_at);

-- RLS ---------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.audit_logs enable row level security;

-- Cada usuário só enxerga/edita o próprio perfil.
create policy "profiles_select_own" on public.profiles
  for select
  using (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- audit_logs não tem nenhuma policy de acesso para roles de cliente: com RLS
-- habilitado e nenhuma policy, apenas a service_role (que ignora RLS) pode
-- ler/escrever. Isso é intencional.

-- Cria automaticamente um profile ao nascer um novo usuário no Supabase Auth.
-- O papel é lido de raw_user_meta_data.role, definido no momento do cadastro
-- (ex.: signUp com options.data.role = 'customer').
create function public.handle_new_user()
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
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at automático -----------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
