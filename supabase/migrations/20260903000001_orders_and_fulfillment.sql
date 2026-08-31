-- Fase 4: pedidos, seleção de distribuidora (fulfillment) e reserva de estoque.
--
-- Escrita nestas tabelas é feita exclusivamente pelo backend (service_role) — são
-- regras críticas (seção 9 da arquitetura). RLS aqui existe para LEITURA
-- controlada por cliente/distribuidora, nunca para escrita direta do app.

create type public.order_status as enum (
  'CREATED',
  'FULFILLMENT_SELECTED',
  'STOCK_RESERVED',
  'AWAITING_PAYMENT',
  'PAID',
  'PARTNER_CONFIRMATION',
  'ACCEPTED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'SEARCHING_DRIVER',
  'DRIVER_ASSIGNED',
  'DRIVER_TO_PICKUP',
  'PICKED_UP',
  'IN_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'REFUNDED',
  'PAYMENT_FAILED',
  'DISPUTED',
  'EXPIRED'
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id),
  address_id uuid not null references public.addresses (id),
  partner_id uuid references public.partners (id),
  status public.order_status not null default 'CREATED',
  algorithm_version text,
  subtotal_cents bigint,
  service_fee_cents bigint,
  delivery_fee_cents bigint,
  total_cents bigint,
  pricing_snapshot jsonb,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index orders_customer_idx on public.orders (customer_id);
create index orders_partner_idx on public.orders (partner_id);
create index orders_status_idx on public.orders (status);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  catalog_product_id uuid not null references public.catalog_products (id),
  partner_product_id uuid references public.partner_products (id),
  quantity int not null check (quantity > 0),
  unit_price_cents bigint,
  created_at timestamptz not null default now()
);

create index order_items_order_idx on public.order_items (order_id);

-- Histórico imutável de transições (seção 39/40). Nunca é apagado nem sobrescrito.
create table public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  previous_status public.order_status,
  new_status public.order_status not null,
  actor text not null default 'system',
  reason text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index order_status_history_order_idx on public.order_status_history (order_id);

-- Todos os candidatos avaliados pelo FulfillmentSelectionService para o pedido,
-- elegíveis ou não, com o motivo de eliminação — auditoria completa (seção 19).
create table public.fulfillment_candidates (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  partner_id uuid not null references public.partners (id),
  eligible boolean not null,
  elimination_reason text,
  distance_km numeric(8, 2),
  eta_minutes numeric(6, 1),
  score numeric(10, 4),
  created_at timestamptz not null default now()
);

create index fulfillment_candidates_order_idx on public.fulfillment_candidates (order_id);

-- A decisão vencedora — 1:1 com o pedido no MVP (um pedido = uma distribuidora).
create table public.fulfillment_decisions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id) on delete cascade,
  partner_id uuid not null references public.partners (id),
  algorithm_version text not null,
  distance_km numeric(8, 2),
  eta_minutes numeric(6, 1),
  score numeric(10, 4),
  created_at timestamptz not null default now()
);

-- Reserva temporária de estoque durante o checkout (seção 17). Uma linha por
-- item do pedido; liberada (RELEASED) ou confirmada (CONFIRMED) conforme o
-- desfecho do pagamento (Fase 5), ou expira sozinha após expires_at.
create table public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references public.inventory (id),
  order_id uuid not null references public.orders (id) on delete cascade,
  quantity int not null check (quantity > 0),
  status text not null default 'PENDING' check (status in ('PENDING', 'CONFIRMED', 'RELEASED', 'EXPIRED')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index inventory_reservations_order_idx on public.inventory_reservations (order_id);
create index inventory_reservations_pending_expiry_idx
  on public.inventory_reservations (expires_at)
  where status = 'PENDING';

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

create trigger inventory_reservations_set_updated_at
  before update on public.inventory_reservations
  for each row execute function public.set_updated_at();

-- RLS ---------------------------------------------------------------------

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_history enable row level security;
alter table public.fulfillment_candidates enable row level security;
alter table public.fulfillment_decisions enable row level security;
alter table public.inventory_reservations enable row level security;

-- Cliente lê os próprios pedidos (acompanhamento — Fase 8). Nenhuma policy de
-- escrita: só o backend (service_role) cria/atualiza pedidos.
create policy "orders_select_own_customer" on public.orders
  for select
  using (customer_id = auth.uid());

create policy "orders_select_own_partner" on public.orders
  for select
  using (partner_id is not null and public.is_partner_member(partner_id));

create policy "order_items_select_via_order" on public.order_items
  for select
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and (o.customer_id = auth.uid() or (o.partner_id is not null and public.is_partner_member(o.partner_id)))
    )
  );

create policy "order_status_history_select_via_order" on public.order_status_history
  for select
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_status_history.order_id
        and (o.customer_id = auth.uid() or (o.partner_id is not null and public.is_partner_member(o.partner_id)))
    )
  );

-- fulfillment_candidates revela quais outras distribuidoras foram avaliadas e
-- por quê foram eliminadas — dado concorrencialmente sensível. Sem policy de
-- leitura para cliente/parceiro: só service_role (auditoria interna/admin).

-- fulfillment_decisions: o cliente pode ver qual distribuidora foi escolhida
-- para o próprio pedido (isso já aparece via orders.partner_id, mas expor aqui
-- também é inofensivo e útil para telas de acompanhamento).
create policy "fulfillment_decisions_select_via_order" on public.fulfillment_decisions
  for select
  using (
    exists (
      select 1 from public.orders o
      where o.id = fulfillment_decisions.order_id
        and o.customer_id = auth.uid()
    )
  );

-- inventory_reservations não tem policy de leitura pública: é detalhe
-- operacional interno do estoque, não algo que cliente/parceiro precisem
-- consultar diretamente (o parceiro vê o reflexo em inventory).
