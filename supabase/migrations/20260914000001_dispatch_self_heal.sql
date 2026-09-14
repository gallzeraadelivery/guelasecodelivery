-- Autocorreção do dispatch (seção 27) — pedidos que ficaram em
-- SEARCHING_DRIVER sem nenhuma linha em `deliveries` (ex.: aceito antes de
-- uma mudança de código que passou a exigir isso, uma falha transitória no
-- startDispatchForOrder, etc.) nunca eram detectados pela varredura
-- periódica, porque find_deliveries_needing_offer só olha entregas que já
-- existem. Esta função fecha essa lacuna.
create function public.find_orders_needing_delivery()
returns table (order_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select o.id
  from public.orders o
  where o.status = 'SEARCHING_DRIVER'
    and not exists (
      select 1 from public.deliveries d where d.order_id = o.id
    );
$$;

revoke execute on function public.find_orders_needing_delivery() from public;
grant execute on function public.find_orders_needing_delivery() to service_role;
