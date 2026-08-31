-- Fase 9: regras de saque (nunca hardcode no backend — seção 24/42/62).

insert into public.platform_settings (key, value, description) values
  (
    'withdrawal_rule',
    '{"min_cents": 2000, "max_cents": 500000}',
    'PLACEHOLDER — valor mínimo e máximo por saque de PIX do entregador (seção 38/39). Valores de exemplo, não definitivos.'
  )
on conflict (key) do nothing;
