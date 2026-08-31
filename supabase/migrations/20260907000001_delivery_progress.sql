-- Fase 8: progressão da entrega — retirada, coleta e conclusão (seção 8).
--
-- Corrige accept_delivery_offer (Fase 7): o pedido ficava parado em
-- DRIVER_ASSIGNED enquanto o entregador já estava a caminho da retirada.
-- Correto é avançar imediatamente para DRIVER_TO_PICKUP (só existe uma
-- distinção formal entre os dois no enum, não uma ação real do usuário entre
-- eles) — mesma ideia já usada para ACCEPTED+PREPARING na Fase 7. A entrega
-- também vai direto para TO_PICKUP (ASSIGNED permanece no enum para uso
-- futuro, mas o MVP não passa por ele como estado observável).
create or replace function public.accept_delivery_offer(p_offer_id uuid, p_driver_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer record;
  v_order_id uuid;
begin
  select * into v_offer from public.delivery_offers where id = p_offer_id for update;

  if v_offer.id is null or v_offer.driver_id <> p_driver_id then
    raise exception 'OFFER_NOT_FOUND';
  end if;

  if v_offer.status <> 'OFFERED' or v_offer.expires_at < now() then
    raise exception 'OFFER_NO_LONGER_AVAILABLE';
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

  update public.orders set status = 'DRIVER_TO_PICKUP' where id = v_order_id;
  insert into public.order_status_history (order_id, previous_status, new_status, actor)
  values (v_order_id, 'DRIVER_ASSIGNED', 'DRIVER_TO_PICKUP', 'system');

  insert into public.delivery_events (delivery_id, event_type, actor, metadata)
  values (v_offer.delivery_id, 'DRIVER_ACCEPTED', 'driver', jsonb_build_object('driver_id', p_driver_id));
end;
$$;

-- Entregador chegou na distribuidora.
create function public.mark_delivery_at_pickup(p_delivery_id uuid, p_driver_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delivery record;
begin
  select * into v_delivery from public.deliveries where id = p_delivery_id for update;

  if v_delivery.id is null or v_delivery.driver_id <> p_driver_id then
    raise exception 'DELIVERY_NOT_FOUND';
  end if;
  if v_delivery.status <> 'TO_PICKUP' then
    raise exception 'INVALID_DELIVERY_STATE';
  end if;

  update public.deliveries set status = 'AT_PICKUP' where id = p_delivery_id;
  update public.drivers set status = 'AT_PICKUP' where id = p_driver_id;

  insert into public.delivery_events (delivery_id, event_type, actor)
  values (p_delivery_id, 'ARRIVED_AT_PICKUP', 'driver');
end;
$$;

revoke execute on function public.mark_delivery_at_pickup(uuid, uuid) from public;
grant execute on function public.mark_delivery_at_pickup(uuid, uuid) to service_role;

-- Entregador retirou o pedido na distribuidora e está a caminho do cliente.
create function public.mark_delivery_picked_up(p_delivery_id uuid, p_driver_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delivery record;
begin
  select * into v_delivery from public.deliveries where id = p_delivery_id for update;

  if v_delivery.id is null or v_delivery.driver_id <> p_driver_id then
    raise exception 'DELIVERY_NOT_FOUND';
  end if;
  if v_delivery.status <> 'AT_PICKUP' then
    raise exception 'INVALID_DELIVERY_STATE';
  end if;

  update public.deliveries set status = 'DELIVERING', picked_up_at = now() where id = p_delivery_id;
  update public.drivers set status = 'DELIVERING' where id = p_driver_id;

  update public.orders set status = 'PICKED_UP' where id = v_delivery.order_id;
  insert into public.order_status_history (order_id, previous_status, new_status, actor)
  values (v_delivery.order_id, 'DRIVER_TO_PICKUP', 'PICKED_UP', 'driver');

  update public.orders set status = 'IN_DELIVERY' where id = v_delivery.order_id;
  insert into public.order_status_history (order_id, previous_status, new_status, actor)
  values (v_delivery.order_id, 'PICKED_UP', 'IN_DELIVERY', 'system');

  insert into public.delivery_events (delivery_id, event_type, actor)
  values (p_delivery_id, 'PICKED_UP', 'driver');
end;
$$;

revoke execute on function public.mark_delivery_picked_up(uuid, uuid) from public;
grant execute on function public.mark_delivery_picked_up(uuid, uuid) to service_role;

-- Entregador concluiu a entrega ao cliente. O crédito na carteira do
-- entregador é responsabilidade da Fase 9 (ledger) — este é o ponto de
-- gancho natural para isso, mas ainda não implementado aqui de propósito.
create function public.mark_delivery_delivered(p_delivery_id uuid, p_driver_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delivery record;
begin
  select * into v_delivery from public.deliveries where id = p_delivery_id for update;

  if v_delivery.id is null or v_delivery.driver_id <> p_driver_id then
    raise exception 'DELIVERY_NOT_FOUND';
  end if;
  if v_delivery.status <> 'DELIVERING' then
    raise exception 'INVALID_DELIVERY_STATE';
  end if;

  update public.deliveries set status = 'DELIVERED', delivered_at = now() where id = p_delivery_id;
  update public.drivers set status = 'ONLINE' where id = p_driver_id;

  update public.orders set status = 'DELIVERED' where id = v_delivery.order_id;
  insert into public.order_status_history (order_id, previous_status, new_status, actor)
  values (v_delivery.order_id, 'IN_DELIVERY', 'DELIVERED', 'driver');

  insert into public.delivery_events (delivery_id, event_type, actor)
  values (p_delivery_id, 'DELIVERED', 'driver');
end;
$$;

revoke execute on function public.mark_delivery_delivered(uuid, uuid) from public;
grant execute on function public.mark_delivery_delivered(uuid, uuid) to service_role;

-- O cliente acompanha o pedido (seção 8) e precisa saber qual distribuidora
-- está preparando/entregando — mesma lógica já usada para o entregador na
-- Fase 7 (RLS de partners é restrita a partner_users por padrão).
create policy "partners_select_via_customer_order" on public.partners
  for select
  using (
    exists (
      select 1 from public.orders o
      where o.partner_id = partners.id and o.customer_id = auth.uid()
    )
  );
