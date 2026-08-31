-- Fase 5: pagamentos (checkout com Mercado Pago) e log de eventos de webhook.
-- Escrita exclusiva do backend (service_role) — nunca confiar em retorno do
-- app para confirmar pagamento (seção 23).

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  provider text not null default 'mercadopago',
  external_id text,
  payment_method text,
  gross_amount_cents bigint not null,
  gateway_fee_cents bigint,
  marketplace_fee_cents bigint,
  seller_amount_cents bigint,
  net_amount_cents bigint,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'APPROVED', 'REJECTED', 'REFUNDED', 'CANCELLED', 'IN_PROCESS')),
  checkout_url text,
  raw_init_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payments_order_idx on public.payments (order_id);
create unique index payments_provider_external_id_idx
  on public.payments (provider, external_id)
  where external_id is not null;

-- Log de todo evento recebido do gateway. external_event_id garante
-- idempotência: o mesmo evento nunca é processado duas vezes (seção 23).
create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references public.payments (id),
  provider text not null default 'mercadopago',
  external_event_id text not null,
  event_type text,
  raw_payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text
);

create unique index payment_events_dedupe_idx
  on public.payment_events (provider, external_event_id);

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

-- RLS ---------------------------------------------------------------------

alter table public.payments enable row level security;
alter table public.payment_events enable row level security;

-- Cliente vê o pagamento do próprio pedido (acompanhamento). Nenhuma policy
-- de escrita: só o backend confirma pagamento.
create policy "payments_select_via_order" on public.payments
  for select
  using (
    exists (
      select 1 from public.orders o
      where o.id = payments.order_id and o.customer_id = auth.uid()
    )
  );

-- payment_events é log interno (pode conter dados do gateway não destinados
-- ao cliente) — sem policy de leitura pública, só service_role/admin.
