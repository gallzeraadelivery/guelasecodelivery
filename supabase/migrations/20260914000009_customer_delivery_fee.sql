-- delivery_fee_cents existe na tabela orders desde o início (Fase 4) mas
-- nunca foi calculado nem cobrado — o total do pedido só somava subtotal +
-- taxa de serviço. Corrigido no backend (createOrder); esta migration só
-- cria a configuração com um valor inicial (mesmo formato do
-- driver_payout_rule: mínimo + por km) — ajustável no painel admin em
-- Configurações, sem precisar de deploy.
--
-- Valor inicial é um placeholder (mínimo R$7,00, R$2,00/km — um pouco
-- acima do que o entregador recebe hoje, R$5,00 + R$1,50/km, pra dar
-- alguma margem pra plataforma). Ajustar pro valor real desejado.
insert into public.platform_settings (key, value, description) values
  (
    'customer_delivery_fee_rule',
    '{"min_cents": 700, "per_km_cents": 200}',
    'PLACEHOLDER — taxa de entrega cobrada do cliente (mínimo + por km, mesmo formato de driver_payout_rule). Ajustar pro valor real.'
  )
on conflict (key) do nothing;
