-- Fase 9: carteira do entregador — saldo, extrato (ledger) e saque via PIX
-- (seções 30, 38, 39). Todo crédito/débito passa por wallet_ledger, que é
-- append-only: nunca fazemos update em amount_cents de uma linha já
-- inserida, só inserimos linhas de estorno (REVERSAL) quando necessário —
-- mesmo princípio de auditoria já usado em order_status_history e
-- delivery_events.

create table public.wallets (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null unique references public.drivers (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets (id) on delete cascade,
  type text not null check (type in ('DELIVERY_CREDIT', 'WITHDRAWAL', 'WITHDRAWAL_FEE', 'BONUS', 'ADJUSTMENT', 'REVERSAL')),
  amount_cents bigint not null check (amount_cents <> 0),
  status text not null default 'AVAILABLE' check (status in ('PENDING', 'AVAILABLE', 'BLOCKED')),
  reference_type text,
  reference_id uuid,
  description text,
  created_at timestamptz not null default now()
);

comment on table public.wallet_ledger is
  'Append-only. amount_cents é assinado (positivo = crédito, negativo = débito). Nunca dar update em linhas existentes — correções são novas linhas REVERSAL.';

create index wallet_ledger_wallet_idx on public.wallet_ledger (wallet_id);
create index wallet_ledger_reference_idx on public.wallet_ledger (reference_type, reference_id);

create table public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers (id) on delete cascade,
  wallet_ledger_id uuid references public.wallet_ledger (id),
  amount_cents bigint not null check (amount_cents > 0),
  fee_cents bigint not null default 0 check (fee_cents >= 0),
  pix_key text not null,
  pix_key_type text not null check (pix_key_type in ('CPF', 'CNPJ', 'EMAIL', 'PHONE', 'RANDOM')),
  holder_name text not null,
  status text not null default 'REQUESTED' check (status in ('REQUESTED', 'UNDER_REVIEW', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED')),
  provider text,
  external_id text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz
);

create index withdrawals_driver_idx on public.withdrawals (driver_id);
create index withdrawals_status_idx on public.withdrawals (status);

create trigger withdrawals_set_updated_at
  before update on public.withdrawals
  for each row execute function public.set_updated_at();

-- Saldo disponível para saque: soma apenas do que já está AVAILABLE.
-- PENDING existe para uso futuro (ex.: crédito que só libera após uma
-- janela de disputa) — o MVP credita direto como AVAILABLE.
--
-- security_invoker = true é essencial aqui: sem ele, a view roda com o
-- privilégio do dono (que tem acesso irrestrito a wallet_ledger) e IGNORA a
-- RLS de wallet_ledger para quem consulta a view — vazando o saldo de todos
-- os entregadores para qualquer entregador autenticado. Com
-- security_invoker, a RLS de wallet_ledger é aplicada normalmente com base
-- em quem está consultando.
create view public.wallet_balances
with (security_invoker = true)
as
select
  wallet_id,
  coalesce(sum(amount_cents) filter (where status = 'AVAILABLE'), 0) as available_cents,
  coalesce(sum(amount_cents) filter (where status = 'PENDING'), 0) as pending_cents
from public.wallet_ledger
group by wallet_id;

-- Cria a carteira junto com o cadastro do entregador (mesmo padrão de
-- customers/drivers criados em handle_new_user).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name)
  values (
    new.id,
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'customer'),
    new.raw_user_meta_data ->> 'full_name'
  );

  if coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'customer') = 'customer' then
    insert into public.customers (id) values (new.id);
  elsif (new.raw_user_meta_data ->> 'role')::public.user_role = 'driver' then
    insert into public.drivers (id) values (new.id);
    insert into public.wallets (driver_id) values (new.id);
  end if;

  return new;
end;
$$;

-- Entregas já existentes (Fases 6-8, ambiente local de testes) não passaram
-- pelo handle_new_user acima com a carteira incluída — garante que todo
-- driver já cadastrado ganhe uma.
insert into public.wallets (driver_id)
select d.id from public.drivers d
where not exists (select 1 from public.wallets w where w.driver_id = d.id);

-- Estende mark_delivery_delivered (Fase 8) para creditar o valor da corrida
-- na carteira do entregador assim que a entrega é concluída (seção 30/38:
-- "Pedido finalizado -> saldo da corrida fica disponível na carteira").
create or replace function public.mark_delivery_delivered(p_delivery_id uuid, p_driver_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delivery record;
  v_payout_cents bigint;
  v_wallet_id uuid;
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

  select payout_cents into v_payout_cents
  from public.delivery_offers
  where delivery_id = p_delivery_id and driver_id = p_driver_id and status = 'ACCEPTED'
  limit 1;

  if v_payout_cents is not null and v_payout_cents > 0 then
    select id into v_wallet_id from public.wallets where driver_id = p_driver_id for update;

    if v_wallet_id is not null then
      insert into public.wallet_ledger (wallet_id, type, amount_cents, status, reference_type, reference_id, description)
      values (v_wallet_id, 'DELIVERY_CREDIT', v_payout_cents, 'AVAILABLE', 'delivery', p_delivery_id, 'Corrida concluída');
    end if;
  end if;
end;
$$;

-- Solicita saque: debita o valor imediatamente (mesmo princípio de
-- "reservar agora, estornar se falhar" já usado na reserva de estoque —
-- evita corrida de saque duplo enquanto o pagamento real é processado
-- de forma assíncrona pelo backend).
create function public.request_withdrawal(
  p_driver_id uuid,
  p_amount_cents bigint,
  p_pix_key text,
  p_pix_key_type text,
  p_holder_name text,
  p_min_cents bigint,
  p_max_cents bigint
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet_id uuid;
  v_available_cents bigint;
  v_ledger_id uuid;
  v_withdrawal_id uuid;
begin
  if p_amount_cents < p_min_cents then
    raise exception 'WITHDRAWAL_BELOW_MINIMUM';
  end if;
  if p_amount_cents > p_max_cents then
    raise exception 'WITHDRAWAL_ABOVE_MAXIMUM';
  end if;

  select id into v_wallet_id from public.wallets where driver_id = p_driver_id for update;
  if v_wallet_id is null then
    raise exception 'WALLET_NOT_FOUND';
  end if;

  select coalesce(sum(amount_cents), 0) into v_available_cents
  from public.wallet_ledger
  where wallet_id = v_wallet_id and status = 'AVAILABLE';

  if v_available_cents < p_amount_cents then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  insert into public.wallet_ledger (wallet_id, type, amount_cents, status, reference_type, description)
  values (v_wallet_id, 'WITHDRAWAL', -p_amount_cents, 'AVAILABLE', 'withdrawal', 'Saque solicitado')
  returning id into v_ledger_id;

  insert into public.withdrawals (driver_id, wallet_ledger_id, amount_cents, pix_key, pix_key_type, holder_name, status)
  values (p_driver_id, v_ledger_id, p_amount_cents, p_pix_key, p_pix_key_type, p_holder_name, 'REQUESTED')
  returning id into v_withdrawal_id;

  update public.wallet_ledger set reference_id = v_withdrawal_id where id = v_ledger_id;

  return v_withdrawal_id;
end;
$$;

revoke execute on function public.request_withdrawal(uuid, bigint, text, text, text, bigint, bigint) from public;
grant execute on function public.request_withdrawal(uuid, bigint, text, text, text, bigint, bigint) to service_role;

-- Chamado pelo backend quando o provedor de pagamento (PIX) confirma o saque.
create function public.mark_withdrawal_paid(p_withdrawal_id uuid, p_provider text, p_external_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.withdrawals
  set status = 'PAID', provider = p_provider, external_id = p_external_id, paid_at = now()
  where id = p_withdrawal_id and status in ('REQUESTED', 'UNDER_REVIEW', 'PROCESSING');

  if not found then
    raise exception 'WITHDRAWAL_NOT_FOUND_OR_INVALID_STATE';
  end if;
end;
$$;

revoke execute on function public.mark_withdrawal_paid(uuid, text, text) from public;
grant execute on function public.mark_withdrawal_paid(uuid, text, text) to service_role;

-- Chamado pelo backend quando o saque falha no provedor: estorna o valor
-- debitado (linha REVERSAL, nunca editamos a linha WITHDRAWAL original).
create function public.fail_withdrawal(p_withdrawal_id uuid, p_error_message text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_withdrawal record;
begin
  select * into v_withdrawal from public.withdrawals where id = p_withdrawal_id for update;

  if v_withdrawal.id is null then
    raise exception 'WITHDRAWAL_NOT_FOUND';
  end if;
  if v_withdrawal.status not in ('REQUESTED', 'UNDER_REVIEW', 'PROCESSING') then
    raise exception 'WITHDRAWAL_INVALID_STATE';
  end if;

  update public.withdrawals
  set status = 'FAILED', error_message = p_error_message
  where id = p_withdrawal_id;

  insert into public.wallet_ledger (wallet_id, type, amount_cents, status, reference_type, reference_id, description)
  select w.wallet_id, 'REVERSAL', v_withdrawal.amount_cents, 'AVAILABLE', 'withdrawal', p_withdrawal_id, 'Estorno de saque falho'
  from public.wallet_ledger w
  where w.id = v_withdrawal.wallet_ledger_id;
end;
$$;

revoke execute on function public.fail_withdrawal(uuid, text) from public;
grant execute on function public.fail_withdrawal(uuid, text) to service_role;

-- RLS -----------------------------------------------------------------------

alter table public.wallets enable row level security;
alter table public.wallet_ledger enable row level security;
alter table public.withdrawals enable row level security;

-- Toda escrita passa pelas RPCs (security definer) acima, chamadas pelo
-- backend com service_role — o entregador só lê.
create policy "wallets_select_own" on public.wallets
  for select
  using (driver_id = auth.uid());

create policy "wallet_ledger_select_own" on public.wallet_ledger
  for select
  using (
    exists (
      select 1 from public.wallets w
      where w.id = wallet_ledger.wallet_id and w.driver_id = auth.uid()
    )
  );

create policy "withdrawals_select_own" on public.withdrawals
  for select
  using (driver_id = auth.uid());

grant select on public.wallet_balances to authenticated;
