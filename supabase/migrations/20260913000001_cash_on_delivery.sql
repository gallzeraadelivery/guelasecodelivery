-- Fase 12: pagamento na entrega (dinheiro) — seção decidida em conversa:
-- só dinheiro (sem maquininha, que exigiria hardware/POS fora de escopo);
-- o valor cheio é recebido pelo entregador, que tem sua carteira debitada
-- do que não é dele (subtotal da distribuidora + taxa da plataforma) na
-- confirmação da entrega; o repasse à distribuidora fica registrado em
-- `partner_settlements` para acerto manual pelo admin (mesmo modelo do
-- saque PIX do entregador hoje).

alter table public.orders
  add column payment_method text not null default 'ONLINE'
    check (payment_method in ('ONLINE', 'CASH_ON_DELIVERY'));

alter table public.wallet_ledger drop constraint wallet_ledger_type_check;
alter table public.wallet_ledger add constraint wallet_ledger_type_check
  check (type in ('DELIVERY_CREDIT', 'WITHDRAWAL', 'WITHDRAWAL_FEE', 'BONUS', 'ADJUSTMENT', 'REVERSAL', 'COD_COLLECTED_DEBIT'));

-- Quanto cada distribuidora tem a receber de pedidos pagos em dinheiro na
-- entrega — o dinheiro em si já está com o entregador; isto é só o registro
-- de que a plataforma deve repassar esse valor à distribuidora (acerto
-- manual, fora do app, marcado como feito pelo admin).
create table public.partner_settlements (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id),
  order_id uuid not null unique references public.orders (id),
  amount_cents bigint not null check (amount_cents > 0),
  status text not null default 'PENDING' check (status in ('PENDING', 'SETTLED')),
  settled_at timestamptz,
  settled_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create index partner_settlements_partner_status_idx
  on public.partner_settlements (partner_id, status);

alter table public.partner_settlements enable row level security;
-- Sem policy de propósito (mesmo padrão de partner_payment_accounts) — só
-- service_role toca esta tabela por enquanto; a distribuidora ainda não tem
-- uma tela própria pra ver isso (fica pro admin, via app admin).

insert into public.platform_settings (key, value, description) values
  (
    'cod_max_negative_balance_cents',
    '{"threshold_cents": -15000}',
    'PLACEHOLDER — saldo mínimo (pode ser negativo) que a carteira do entregador precisa ter pra ele conseguir aceitar uma nova entrega com pagamento em dinheiro. Protege a plataforma/distribuidora de um entregador acumular uma dívida grande. Valor de exemplo (-R$150), não definitivo.'
  )
on conflict (key) do nothing;

-- Aceite de oferta — igual à versão anterior, com uma checagem a mais: se a
-- entrega é de um pedido pago em dinheiro, o entregador só pode aceitar se
-- o saldo disponível da carteira dele não estiver abaixo do piso configurado
-- (senão ele poderia acumular uma dívida ilimitada de dinheiro recebido e
-- nunca repassado).
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

-- Conclusão da entrega — igual à versão anterior (credita o payout normal
-- do entregador), com o acréscimo do débito/repasse de pedidos em dinheiro.
create or replace function public.mark_delivery_delivered(p_delivery_id uuid, p_driver_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delivery record;
  v_order record;
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

  select id into v_wallet_id from public.wallets where driver_id = p_driver_id for update;

  select payout_cents into v_payout_cents
  from public.delivery_offers
  where delivery_id = p_delivery_id and driver_id = p_driver_id and status = 'ACCEPTED'
  limit 1;

  if v_wallet_id is not null and v_payout_cents is not null and v_payout_cents > 0 then
    insert into public.wallet_ledger (wallet_id, type, amount_cents, status, reference_type, reference_id, description)
    values (v_wallet_id, 'DELIVERY_CREDIT', v_payout_cents, 'AVAILABLE', 'delivery', p_delivery_id, 'Corrida concluída');
  end if;

  select o.payment_method, o.partner_id, o.subtotal_cents, o.service_fee_cents
    into v_order
  from public.orders o
  where o.id = v_delivery.order_id;

  if v_order.payment_method = 'CASH_ON_DELIVERY' and v_wallet_id is not null then
    insert into public.wallet_ledger (wallet_id, type, amount_cents, status, reference_type, reference_id, description)
    values (
      v_wallet_id,
      'COD_COLLECTED_DEBIT',
      -(coalesce(v_order.subtotal_cents, 0) + coalesce(v_order.service_fee_cents, 0)),
      'AVAILABLE',
      'order',
      v_delivery.order_id,
      'Valor recebido em dinheiro na entrega — repasse pendente'
    );

    insert into public.partner_settlements (partner_id, order_id, amount_cents)
    values (v_order.partner_id, v_delivery.order_id, coalesce(v_order.subtotal_cents, 0));

    update public.payments
    set status = 'APPROVED'
    where order_id = v_delivery.order_id and provider = 'cash_on_delivery';
  end if;
end;
$$;
