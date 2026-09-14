-- Fase 13: chat de suporte em tempo real — chamado (ticket) aberto pelo
-- cliente, vinculado opcionalmente a um pedido, com mensagens trocadas
-- entre cliente e admin.
--
-- RLS aqui só cobre o CLIENTE (mesmo padrão de customer_id = auth.uid() já
-- usado em orders/addresses) — o admin não ganha policy nenhuma de
-- propósito, seguindo a mesma decisão já tomada pro resto do painel admin
-- (comentário em 20260909000001_admin.sql): acesso admin sempre via backend
-- com service_role, nunca policy duplicada por tabela.

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id),
  order_id uuid references public.orders (id),
  subject text not null,
  status text not null default 'OPEN' check (status in ('OPEN', 'CLOSED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index support_tickets_customer_idx on public.support_tickets (customer_id);
create index support_tickets_status_idx on public.support_tickets (status);

create trigger support_tickets_set_updated_at
  before update on public.support_tickets
  for each row execute function public.set_updated_at();

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  sender_role text not null check (sender_role in ('customer', 'admin')),
  sender_id uuid not null,
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create index support_messages_ticket_idx on public.support_messages (ticket_id, created_at);

alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;

create policy "support_tickets_select_own" on public.support_tickets
  for select
  using (customer_id = auth.uid());

create policy "support_tickets_insert_own" on public.support_tickets
  for insert
  with check (customer_id = auth.uid());

create policy "support_messages_select_own_ticket" on public.support_messages
  for select
  using (
    exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id and t.customer_id = auth.uid()
    )
  );

-- Cliente só manda mensagem em ticket próprio, ainda aberto, e só em nome
-- dele mesmo (sender_role/sender_id não podem ser forjados pra 'admin').
create policy "support_messages_insert_own_ticket" on public.support_messages
  for insert
  with check (
    sender_role = 'customer'
    and sender_id = auth.uid()
    and exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id and t.customer_id = auth.uid() and t.status = 'OPEN'
    )
  );

-- Realtime: cliente e admin assinam INSERT em support_messages pro chat
-- atualizar sozinho (visto pela primeira vez neste projeto — nenhuma outra
-- tabela usa Realtime ainda).
alter publication supabase_realtime add table public.support_messages;
