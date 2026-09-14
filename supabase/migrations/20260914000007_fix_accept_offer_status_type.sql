-- A migration anterior (20260914000004) declarou v_order_status como text,
-- mas order_status_history.previous_status é do tipo enum order_status —
-- inserir uma variável text nessa coluna falha com "column is of type
-- order_status but expression is of type text" (literais funcionam por
-- cast implícito, variáveis text não). Reproduzido agora em produção: todo
-- aceite de oferta estava falhando com 500. Corrige tipando a variável
-- certa desde o início.
create or replace function public.accept_delivery_offer(p_offer_id uuid, p_driver_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer record;
  v_order_id uuid;
  v_order_status public.order_status;
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
  select o.status, o.payment_method into v_order_status, v_payment_method from public.orders o where o.id = v_order_id for update;

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
  where id = v_offer.delivery_id;

  update public.drivers set status = 'TO_PICKUP' where id = p_driver_id;

  if v_order_status = 'PREPARING' then
    update public.orders set status = 'READY_FOR_PICKUP' where id = v_order_id;
    insert into public.order_status_history (order_id, previous_status, new_status, actor)
    values (v_order_id, 'PREPARING', 'READY_FOR_PICKUP', 'system');
    v_order_status := 'READY_FOR_PICKUP';
  end if;

  if v_order_status = 'READY_FOR_PICKUP' then
    update public.orders set status = 'SEARCHING_DRIVER' where id = v_order_id;
    insert into public.order_status_history (order_id, previous_status, new_status, actor)
    values (v_order_id, 'READY_FOR_PICKUP', 'SEARCHING_DRIVER', 'system');
    v_order_status := 'SEARCHING_DRIVER';
  end if;

  update public.orders set status = 'DRIVER_ASSIGNED' where id = v_order_id;
  insert into public.order_status_history (order_id, previous_status, new_status, actor)
  values (v_order_id, v_order_status, 'DRIVER_ASSIGNED', 'system');

  insert into public.delivery_events (delivery_id, event_type, actor, metadata)
  values (v_offer.delivery_id, 'DRIVER_ACCEPTED', 'driver', jsonb_build_object('driver_id', p_driver_id));
end;
$$;

revoke execute on function public.accept_delivery_offer(uuid, uuid) from public;
grant execute on function public.accept_delivery_offer(uuid, uuid) to service_role;
