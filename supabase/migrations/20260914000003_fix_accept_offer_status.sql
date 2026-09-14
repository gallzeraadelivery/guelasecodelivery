-- Corrige accept_delivery_offer: a entrega ficava travada em status
-- 'ASSIGNED' pra sempre — nenhuma função no sistema move uma entrega de
-- 'ASSIGNED' para 'TO_PICKUP', então o app do entregador nunca encontrava a
-- corrida ativa (a query filtra por TO_PICKUP/AT_PICKUP/DELIVERING) e ficava
-- preso no spinner, e mark_delivery_at_pickup também exigia status
-- 'TO_PICKUP' pra aceitar "Cheguei na distribuidora". Aceitar a oferta já É
-- o entregador começando a se deslocar até a distribuidora, então não faz
-- sentido ter um estado intermediário "ASSIGNED" sem transição própria.
create or replace function public.accept_delivery_offer(p_offer_id uuid, p_driver_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer record;
  v_order_id uuid;
  v_payment_method text;
  v_available_cents bigint;
  v_min_balance_cents bigint;
begin
  select * into v_offer from public.delivery_offers where id = p_offer_id for update;

  if v_offer.id is null or v_offer.driver_id <> p_driver_id then
    raise exception 'OFFER_NOT_FOUND';
  end if;

  if v_offer.status <> 'OFFERED' or v_offer.expires_at < now() then
    raise exception 'OFFER_NO_LONGER_AVAILABLE';
  end if;

  select d.order_id into v_order_id from public.deliveries d where d.id = v_offer.delivery_id;
  select o.payment_method into v_payment_method from public.orders o where o.id = v_order_id;

  if v_payment_method = 'CASH_ON_DELIVERY' then
    select coalesce(sum(wl.amount_cents), 0) into v_available_cents
    from public.wallet_ledger wl
    join public.wallets w on w.id = wl.wallet_id
    where w.driver_id = p_driver_id and wl.status = 'AVAILABLE';

    select (value ->> 'threshold_cents')::bigint into v_min_balance_cents
    from public.platform_settings where key = 'cod_max_negative_balance_cents';

    if v_available_cents < coalesce(v_min_balance_cents, -15000) then
      raise exception 'DRIVER_BALANCE_TOO_LOW';
    end if;
  end if;

  update public.delivery_offers set status = 'ACCEPTED', responded_at = now() where id = p_offer_id;

  update public.delivery_offers
  set status = 'CANCELLED', responded_at = now()
  where delivery_id = v_offer.delivery_id and status = 'OFFERED' and id <> p_offer_id;

  update public.deliveries
  set driver_id = p_driver_id, status = 'TO_PICKUP', assigned_at = now()
  where id = v_offer.delivery_id
  returning order_id into v_order_id;

  update public.drivers set status = 'TO_PICKUP' where id = p_driver_id;

  update public.orders set status = 'DRIVER_ASSIGNED' where id = v_order_id;
  insert into public.order_status_history (order_id, previous_status, new_status, actor)
  values (v_order_id, 'SEARCHING_DRIVER', 'DRIVER_ASSIGNED', 'system');

  insert into public.delivery_events (delivery_id, event_type, actor, metadata)
  values (v_offer.delivery_id, 'DRIVER_ACCEPTED', 'driver', jsonb_build_object('driver_id', p_driver_id));
end;
$$;

revoke execute on function public.accept_delivery_offer(uuid, uuid) from public;
grant execute on function public.accept_delivery_offer(uuid, uuid) to service_role;

-- Corrige qualquer entrega que já ficou presa em 'ASSIGNED' por esse bug.
update public.deliveries set status = 'TO_PICKUP' where status = 'ASSIGNED';
