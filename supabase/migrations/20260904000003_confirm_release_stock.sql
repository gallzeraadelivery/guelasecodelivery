-- Fase 5: conclusão do ciclo de vida do estoque reservado (seção 17).
-- reserva (PENDING) -> venda (CONFIRMED, ao pagamento aprovado) ou
-- reserva (PENDING) -> liberada (RELEASED, ao pagamento falhar/for cancelado).
-- (A expiração por tempo já existe desde a Fase 4 em release_expired_reservations.)

-- Pagamento aprovado: reserva vira venda. Debita definitivamente stock_quantity
-- e zera a parcela correspondente de reserved_quantity (ela já não contava
-- como "disponível" desde a reserva — isso só formaliza que o item saiu do
-- estoque físico).
create function public.confirm_order_stock(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res record;
begin
  for v_res in
    select id, inventory_id, quantity
    from public.inventory_reservations
    where order_id = p_order_id and status = 'PENDING'
    for update
  loop
    update public.inventory
    set stock_quantity = greatest(stock_quantity - v_res.quantity, 0),
        reserved_quantity = greatest(reserved_quantity - v_res.quantity, 0)
    where id = v_res.inventory_id;

    update public.inventory_reservations
    set status = 'CONFIRMED'
    where id = v_res.id;
  end loop;
end;
$$;

revoke execute on function public.confirm_order_stock(uuid) from public;
grant execute on function public.confirm_order_stock(uuid) to service_role;

-- Pagamento falhou/foi cancelado antes de aprovar: libera a reserva sem
-- debitar o estoque físico (ele nunca chegou a sair do estoque).
create function public.release_order_stock(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res record;
begin
  for v_res in
    select id, inventory_id, quantity
    from public.inventory_reservations
    where order_id = p_order_id and status = 'PENDING'
    for update
  loop
    update public.inventory
    set reserved_quantity = greatest(reserved_quantity - v_res.quantity, 0)
    where id = v_res.inventory_id;

    update public.inventory_reservations
    set status = 'RELEASED'
    where id = v_res.id;
  end loop;
end;
$$;

revoke execute on function public.release_order_stock(uuid) from public;
grant execute on function public.release_order_stock(uuid) to service_role;
