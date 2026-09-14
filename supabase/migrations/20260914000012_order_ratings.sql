-- Fase 14: avaliação do pedido/entregador pelo cliente, depois de entregue.
create table public.order_ratings (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  driver_id uuid references public.drivers (id) on delete set null,
  stars smallint not null check (stars between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

create index order_ratings_driver_idx on public.order_ratings (driver_id);

-- O cliente nunca manda driver_id direto (não teria como saber com certeza) —
-- preenchido automaticamente a partir da entrega vinculada ao pedido.
create function public.set_order_rating_driver_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select driver_id into new.driver_id from public.deliveries where order_id = new.order_id;
  return new;
end;
$$;

create trigger order_ratings_set_driver_id
  before insert on public.order_ratings
  for each row execute function public.set_order_rating_driver_id();

alter table public.order_ratings enable row level security;

create policy "order_ratings_select_own" on public.order_ratings
  for select
  using (customer_id = auth.uid());

-- Média/contagem por entregador — só um número agregado (não expõe
-- comentário nem quem avaliou), então liberado pra qualquer usuário
-- autenticado consultar a própria nota sem precisar de rota no backend.
create function public.get_driver_rating_summary(p_driver_id uuid)
returns table (avg_stars numeric, ratings_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(avg(stars), 0)::numeric(3, 2), count(*)
  from public.order_ratings
  where driver_id = p_driver_id;
$$;

revoke execute on function public.get_driver_rating_summary(uuid) from public;
grant execute on function public.get_driver_rating_summary(uuid) to authenticated;

-- Só dá pra avaliar o próprio pedido, e só depois de entregue (o unique em
-- order_id já impede avaliar duas vezes).
create policy "order_ratings_insert_own" on public.order_ratings
  for insert
  with check (
    customer_id = auth.uid()
    and exists (
      select 1 from public.orders o
      where o.id = order_id and o.customer_id = auth.uid() and o.status = 'DELIVERED'
    )
  );
