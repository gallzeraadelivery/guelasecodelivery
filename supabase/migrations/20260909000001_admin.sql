-- Fase 10: suporte do painel administrativo — financeiro, configurações,
-- auditoria e antifraude.
--
-- Decisão de design: diferente dos apps cliente/entregador/parceiro (que leem
-- boa parte dos dados direto via Supabase + RLS), o painel admin NUNCA lê
-- direto — todo acesso passa pelo backend com service_role, autenticado por
-- requireAdminId (que já checa profiles.role diretamente, sem precisar de
-- policy nenhuma, porque service_role ignora RLS). Isso evita manter dezenas
-- de policies novas de leitura ampla espalhadas pelas tabelas só para o
-- admin. Esta migration adiciona apenas a agregação financeira, que é mais
-- correta e simples feita em SQL do que somando linhas no backend.

-- Resumo financeiro (seção financeiro do painel admin): receita bruta,
-- taxa de serviço da plataforma, valor pago a distribuidoras (via
-- Mercado Pago split, fora do nosso ledger) e payouts de entregadores,
-- tudo calculado sobre pedidos DELIVERED. Saques somam o que já foi
-- efetivamente pago (PAID) e o que está pendente de processamento.
create function public.admin_financial_summary()
returns table (
  delivered_orders_count bigint,
  gross_revenue_cents numeric,
  service_fee_revenue_cents numeric,
  delivery_fee_cents numeric,
  driver_payouts_credited_cents numeric,
  withdrawals_paid_cents numeric,
  withdrawals_pending_cents numeric,
  withdrawals_pending_count bigint
)
language sql
security definer
stable
set search_path = public
as $$
  select
    (select count(*) from public.orders where status = 'DELIVERED'),
    (select coalesce(sum(total_cents), 0) from public.orders where status = 'DELIVERED'),
    (select coalesce(sum(service_fee_cents), 0) from public.orders where status = 'DELIVERED'),
    (select coalesce(sum(delivery_fee_cents), 0) from public.orders where status = 'DELIVERED'),
    (select coalesce(sum(amount_cents), 0) from public.wallet_ledger where type = 'DELIVERY_CREDIT'),
    (select coalesce(sum(amount_cents), 0) from public.withdrawals where status = 'PAID'),
    (select coalesce(sum(amount_cents), 0) from public.withdrawals where status in ('REQUESTED', 'UNDER_REVIEW', 'PROCESSING')),
    (select count(*) from public.withdrawals where status in ('REQUESTED', 'UNDER_REVIEW', 'PROCESSING'));
$$;

revoke execute on function public.admin_financial_summary() from public;
grant execute on function public.admin_financial_summary() to service_role;

insert into public.platform_settings (key, value, description) values
  (
    'antifraude_payment_failure_threshold',
    '3',
    'PLACEHOLDER — quantidade de pagamentos rejeitados do mesmo cliente para aparecer como flag de antifraude no painel admin.'
  )
on conflict (key) do nothing;
