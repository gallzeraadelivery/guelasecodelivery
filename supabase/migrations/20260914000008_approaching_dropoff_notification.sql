-- Aviso proativo "entregador chegando" pro cliente (igual iFood): calculado
-- pela localização em tempo real do entregador vs. o endereço de entrega,
-- sem depender de nenhuma ação manual do entregador.

alter table public.deliveries add column approaching_dropoff_notified boolean not null default false;

-- get_driver_location segue o mesmo padrão de get_partner_location/
-- get_address_location (seção 27/29) — só service_role chama.
create function public.get_driver_location(p_driver_id uuid)
returns table (lat double precision, lng double precision)
language sql
stable
security definer
set search_path = public
as $$
  select ST_Y(location::geometry), ST_X(location::geometry)
  from public.driver_locations
  where driver_id = p_driver_id;
$$;

revoke execute on function public.get_driver_location(uuid) from public;
grant execute on function public.get_driver_location(uuid) to service_role;

-- Entregas em andamento (a caminho do cliente) que ainda não avisaram —
-- usado pela varredura periódica pra saber quais checar.
create function public.find_deliveries_needing_approach_check()
returns table (delivery_id uuid, order_id uuid, driver_id uuid, dropoff_address_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select id, order_id, driver_id, dropoff_address_id
  from public.deliveries
  where status = 'DELIVERING' and approaching_dropoff_notified = false and driver_id is not null;
$$;

revoke execute on function public.find_deliveries_needing_approach_check() from public;
grant execute on function public.find_deliveries_needing_approach_check() to service_role;
