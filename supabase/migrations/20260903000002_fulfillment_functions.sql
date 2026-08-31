-- Fase 4: funções de suporte ao FulfillmentSelectionService.
--
-- Todas são SECURITY DEFINER e têm EXECUTE revogado de PUBLIC/anon/authenticated:
-- só a service_role (usada exclusivamente pelo backend) pode chamá-las. Isso
-- importa porque o Supabase expõe automaticamente toda função do schema public
-- via PostgREST/RPC — sem a revogação, qualquer cliente autenticado poderia
-- consultar estoque/preço de todas as distribuidoras concorrentes.

-- Retorna, para um ponto (endereço do cliente) e um carrinho, todos os
-- parceiros cuja área de atendimento cobre o ponto — elegíveis ou não —
-- com os sinais necessários para decidir e para auditar eliminações
-- (distância, status online, horário de funcionamento, estoque completo).
create function public.find_partner_candidates(p_lat double precision, p_lng double precision, p_items jsonb)
returns table (
  partner_id uuid,
  trade_name text,
  is_online boolean,
  is_open_now boolean,
  has_full_stock boolean,
  missing_catalog_product_id uuid,
  distance_km numeric,
  partner_lat double precision,
  partner_lng double precision
)
language sql
stable
security definer
set search_path = public
as $$
  with customer_point as (
    select ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography as geog
  ),
  cart as (
    select (item ->> 'catalog_product_id')::uuid as catalog_product_id,
           (item ->> 'quantity')::int as quantity
    from jsonb_array_elements(p_items) as item
  ),
  nearby_partners as (
    select distinct pr.id, pr.trade_name, pr.status, pr.location
    from public.partners pr
    join public.service_areas sa on sa.partner_id = pr.id
    cross join customer_point cp
    where ST_DWithin(sa.center, cp.geog, sa.radius_km * 1000)
  ),
  stock_per_partner as (
    select
      np.id as partner_id,
      bool_and(
        pp.id is not null and pp.available and (i.stock_quantity - i.reserved_quantity) >= cart.quantity
      ) as has_full_stock,
      (array_agg(cart.catalog_product_id) filter (
        where pp.id is null or not pp.available or (i.stock_quantity - i.reserved_quantity) < cart.quantity
      ))[1] as missing_catalog_product_id
    from nearby_partners np
    cross join cart
    left join public.partner_products pp
      on pp.partner_id = np.id and pp.catalog_product_id = cart.catalog_product_id
    left join public.inventory i on i.partner_product_id = pp.id
    group by np.id
  )
  select
    np.id as partner_id,
    np.trade_name,
    (np.status = 'ONLINE') as is_online,
    exists (
      select 1 from public.partner_hours ph
      where ph.partner_id = np.id
        and ph.weekday = extract(dow from (now() at time zone 'America/Cuiaba'))::int
        and (now() at time zone 'America/Cuiaba')::time between ph.opens_at and ph.closes_at
    ) as is_open_now,
    coalesce(sp.has_full_stock, false) as has_full_stock,
    sp.missing_catalog_product_id,
    round((ST_Distance(np.location, cp.geog) / 1000.0)::numeric, 2) as distance_km,
    ST_Y(np.location::geometry) as partner_lat,
    ST_X(np.location::geometry) as partner_lng
  from nearby_partners np
  cross join customer_point cp
  left join stock_per_partner sp on sp.partner_id = np.id;
$$;

revoke execute on function public.find_partner_candidates(double precision, double precision, jsonb) from public;
grant execute on function public.find_partner_candidates(double precision, double precision, jsonb) to service_role;

-- Reserva atomicamente o estoque de todos os itens do pedido junto ao parceiro
-- vencedor. Trava as linhas de inventory (FOR UPDATE) em ordem estável de
-- catalog_product_id para reduzir risco de deadlock entre reservas concorrentes.
-- Lança exceção INSUFFICIENT_STOCK:<catalog_product_id> se qualquer item não
-- tiver mais estoque suficiente (condição de corrida entre a seleção e a
-- reserva) — o backend decide o que fazer (cancelar o pedido e pedir retry).
create function public.reserve_order_stock(p_order_id uuid, p_partner_id uuid, p_expires_minutes int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expires_at timestamptz := now() + make_interval(mins => p_expires_minutes);
  v_item record;
  v_partner_product_id uuid;
  v_inventory_id uuid;
  v_available int;
begin
  for v_item in
    select oi.id as order_item_id, oi.catalog_product_id, oi.quantity
    from public.order_items oi
    where oi.order_id = p_order_id
    order by oi.catalog_product_id
  loop
    select pp.id into v_partner_product_id
    from public.partner_products pp
    where pp.partner_id = p_partner_id and pp.catalog_product_id = v_item.catalog_product_id;

    if v_partner_product_id is null then
      raise exception 'INSUFFICIENT_STOCK:%', v_item.catalog_product_id;
    end if;

    select i.id, (i.stock_quantity - i.reserved_quantity)
      into v_inventory_id, v_available
    from public.inventory i
    where i.partner_product_id = v_partner_product_id
    for update;

    if v_inventory_id is null or v_available < v_item.quantity then
      raise exception 'INSUFFICIENT_STOCK:%', v_item.catalog_product_id;
    end if;

    update public.inventory
    set reserved_quantity = reserved_quantity + v_item.quantity
    where id = v_inventory_id;

    insert into public.inventory_reservations (inventory_id, order_id, quantity, status, expires_at)
    values (v_inventory_id, p_order_id, v_item.quantity, 'PENDING', v_expires_at);

    update public.order_items
    set partner_product_id = v_partner_product_id,
        unit_price_cents = (select price_cents from public.partner_products where id = v_partner_product_id)
    where id = v_item.order_item_id;
  end loop;
end;
$$;

revoke execute on function public.reserve_order_stock(uuid, uuid, int) from public;
grant execute on function public.reserve_order_stock(uuid, uuid, int) to service_role;

-- Libera reservas PENDING expiradas (pagamento nunca confirmado a tempo) e
-- expira o pedido correspondente. Projetada para ser chamada periodicamente
-- (job em processo no backend nesta fase; migrar para Supabase Cron/scheduler
-- dedicado é um ajuste de infraestrutura, não de lógica).
create function public.release_expired_reservations()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_released int := 0;
  v_res record;
  v_prev_status public.order_status;
begin
  for v_res in
    select id, inventory_id, order_id, quantity
    from public.inventory_reservations
    where status = 'PENDING' and expires_at < now()
    for update skip locked
  loop
    update public.inventory
    set reserved_quantity = greatest(reserved_quantity - v_res.quantity, 0)
    where id = v_res.inventory_id;

    update public.inventory_reservations
    set status = 'EXPIRED'
    where id = v_res.id;

    select status into v_prev_status from public.orders where id = v_res.order_id for update;

    if v_prev_status in ('STOCK_RESERVED', 'AWAITING_PAYMENT') then
      update public.orders set status = 'EXPIRED' where id = v_res.order_id;

      insert into public.order_status_history (order_id, previous_status, new_status, actor, reason)
      values (v_res.order_id, v_prev_status, 'EXPIRED', 'system',
        'Reserva de estoque expirou sem pagamento confirmado');
    end if;

    v_released := v_released + 1;
  end loop;

  return v_released;
end;
$$;

revoke execute on function public.release_expired_reservations() from public;
grant execute on function public.release_expired_reservations() to service_role;
