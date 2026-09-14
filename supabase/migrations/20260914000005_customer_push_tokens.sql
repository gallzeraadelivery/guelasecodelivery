-- Notificação push pro cliente a cada mudança relevante de status do
-- pedido (Fase 12) — mesmo padrão já usado pro entregador (seção 27).
alter table public.customers add column push_token text;

create policy "customers_update_own" on public.customers
  for update
  using (id = auth.uid())
  with check (id = auth.uid());
