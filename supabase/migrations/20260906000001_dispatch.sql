-- Fase 7: dispatch — busca de entregador, ofertas e histórico da entrega.

create type public.delivery_status as enum (
  'SEARCHING',
  'ASSIGNED',
  'TO_PICKUP',
  'AT_PICKUP',
  'DELIVERING',
  'DELIVERED',
  'CANCELLED',
  'FAILED'
);

create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id) on delete cascade,
  driver_id uuid references public.drivers (id),
  pickup_partner_id uuid not null references public.partners (id),
  dropoff_address_id uuid not null references public.addresses (id),
  status public.delivery_status not null default 'SEARCHING',
  search_radius_km numeric(5, 2) not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  assigned_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz
);

create index deliveries_driver_idx on public.deliveries (driver_id);
create index deliveries_status_idx on public.deliveries (status);

-- Uma oferta por vez, para um único entregador (seção 27 — busca progressiva,
-- nunca broadcast para todos). payout_rule_snapshot preserva a regra de
-- remuneração usada, mesmo que a configuração mude depois (seção 30/43/61).
create table public.delivery_offers (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries (id) on delete cascade,
  driver_id uuid not null references public.drivers (id),
  status text not null default 'OFFERED'
    check (status in ('OFFERED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED')),
  distance_to_pickup_km numeric(8, 2),
  distance_to_dropoff_km numeric(8, 2),
  total_distance_km numeric(8, 2),
  eta_minutes numeric(6, 1),
  payout_cents bigint,
  payout_rule_snapshot jsonb,
  search_radius_km numeric(5, 2),
  offered_at timestamptz not null default now(),
  responded_at timestamptz,
  expires_at timestamptz not null
);

create index delivery_offers_delivery_idx on public.delivery_offers (delivery_id);
create index delivery_offers_driver_idx on public.delivery_offers (driver_id);
create index delivery_offers_pending_idx
  on public.delivery_offers (expires_at)
  where status = 'OFFERED';

create table public.delivery_events (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries (id) on delete cascade,
  event_type text not null,
  actor text not null default 'system',
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index delivery_events_delivery_idx on public.delivery_events (delivery_id);

create trigger deliveries_set_updated_at
  before update on public.deliveries
  for each row execute function public.set_updated_at();

-- RLS ---------------------------------------------------------------------

alter table public.deliveries enable row level security;
alter table public.delivery_offers enable row level security;
alter table public.delivery_events enable row level security;

create policy "deliveries_select_own_driver" on public.deliveries
  for select
  using (driver_id = auth.uid());

-- Antes do aceite, deliveries.driver_id ainda é nulo — mas o entregador
-- precisa ler o nome/local da distribuidora para decidir se aceita a oferta
-- (seção 29). Qualquer entregador que já recebeu uma oferta para esta
-- entrega (aceita ou não) pode lê-la.
create policy "deliveries_select_via_own_offer" on public.deliveries
  for select
  using (
    exists (
      select 1 from public.delivery_offers o
      where o.delivery_id = deliveries.id and o.driver_id = auth.uid()
    )
  );

create policy "deliveries_select_own_partner" on public.deliveries
  for select
  using (public.is_partner_member(pickup_partner_id));

-- O entregador enxerga (poll) as próprias ofertas, mas aceitar/recusar passa
-- pelo backend via RPC (accept_delivery_offer/reject_delivery_offer) — nunca
-- por UPDATE direto, para evitar corrida entre duas ofertas expirando/sendo
-- respondidas ao mesmo tempo.
create policy "delivery_offers_select_own" on public.delivery_offers
  for select
  using (driver_id = auth.uid());

-- delivery_events é log interno — sem policy de leitura pública.

-- A distribuidora (nome/documento) fica sob RLS restrita a partner_users
-- (Fase 2) — mas o entregador precisa ver de qual distribuidora é a corrida
-- para decidir se aceita a oferta (seção 29), então quem tem oferta/entrega
-- ligada àquele partner_id pode ler a linha (nome e localização já seriam
-- visíveis fisicamente ao entregador de qualquer forma).
create policy "partners_select_via_driver_delivery" on public.partners
  for select
  using (
    exists (
      select 1 from public.deliveries d
      join public.delivery_offers o on o.delivery_id = d.id
      where d.pickup_partner_id = partners.id and o.driver_id = auth.uid()
    )
  );

-- Funções -------------------------------------------------------------------

-- Entregadores online, com KYC aprovado, dentro do raio da distribuidora de
-- retirada, excluindo quem já foi ofertado/recusou nesta busca.
create function public.find_driver_candidates(
  p_lat double precision,
  p_lng double precision,
  p_radius_km numeric,
  p_exclude_driver_ids uuid[]
)
returns table (driver_id uuid, distance_km numeric)
language sql
stable
security definer
set search_path = public
as $$
  select
    d.id,
    round((ST_Distance(dl.location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography) / 1000.0)::numeric, 2)
      as distance_km
  from public.drivers d
  join public.driver_locations dl on dl.driver_id = d.id
  where d.status = 'ONLINE'
    and d.kyc_status = 'APPROVED'
    and not (d.id = any(p_exclude_driver_ids))
    and ST_DWithin(dl.location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, p_radius_km * 1000)
  order by distance_km asc;
$$;

revoke execute on function public.find_driver_candidates(double precision, double precision, numeric, uuid[]) from public;
grant execute on function public.find_driver_candidates(double precision, double precision, numeric, uuid[]) to service_role;

-- Aceite atômico: trava a oferta, valida dono/validade, atribui a entrega e
-- avança o pedido — tudo ou nada (mesma técnica de reserve_order_stock).
create function public.accept_delivery_offer(p_offer_id uuid, p_driver_id uuid)
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
  set driver_id = p_driver_id, status = 'ASSIGNED', assigned_at = now()
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

create function public.reject_delivery_offer(p_offer_id uuid, p_driver_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer record;
begin
  select * into v_offer from public.delivery_offers where id = p_offer_id for update;

  if v_offer.id is null or v_offer.driver_id <> p_driver_id then
    raise exception 'OFFER_NOT_FOUND';
  end if;

  if v_offer.status <> 'OFFERED' then
    raise exception 'OFFER_NO_LONGER_AVAILABLE';
  end if;

  update public.delivery_offers set status = 'REJECTED', responded_at = now() where id = p_offer_id;

  insert into public.delivery_events (delivery_id, event_type, actor, metadata)
  values (v_offer.delivery_id, 'DRIVER_REJECTED', 'driver', jsonb_build_object('driver_id', p_driver_id));
end;
$$;

revoke execute on function public.reject_delivery_offer(uuid, uuid) from public;
grant execute on function public.reject_delivery_offer(uuid, uuid) to service_role;

create function public.get_partner_location(p_partner_id uuid)
returns table (lat double precision, lng double precision)
language sql
stable
security definer
set search_path = public
as $$
  select ST_Y(location::geometry), ST_X(location::geometry)
  from public.partners
  where id = p_partner_id and location is not null;
$$;

revoke execute on function public.get_partner_location(uuid) from public;
grant execute on function public.get_partner_location(uuid) to service_role;

-- Entregas em busca que não têm nenhuma oferta ativa (nunca ofertadas ainda,
-- ou a última expirou/foi recusada) — usada pelo job periódico de dispatch.
create function public.find_deliveries_needing_offer()
returns table (delivery_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select d.id
  from public.deliveries d
  where d.status = 'SEARCHING'
    and not exists (
      select 1 from public.delivery_offers o
      where o.delivery_id = d.id and o.status = 'OFFERED' and o.expires_at > now()
    );
$$;

revoke execute on function public.find_deliveries_needing_offer() from public;
grant execute on function public.find_deliveries_needing_offer() to service_role;
