-- Fase 7: configurações do dispatch (nunca hardcode no backend — seção 27/28/30).

insert into public.platform_settings (key, value, description) values
  (
    'dispatch_radius_tiers_km',
    '[1, 2, 3, 5]',
    'Raios progressivos (km) usados na busca por entregador — seção 27. Expande para o próximo valor quando ninguém aceita dentro do raio atual.'
  ),
  (
    'dispatch_offer_timeout_seconds',
    '30',
    'Segundos que um entregador tem para responder a uma oferta antes dela expirar e o dispatch tentar o próximo candidato.'
  ),
  (
    'driver_payout_rule',
    '{"min_cents": 500, "per_km_cents": 150}',
    'PLACEHOLDER — motor de remuneração do entregador (seção 30): mínimo por corrida + valor por km da distância total (retirada + entrega). Valores de exemplo, não definitivos.'
  )
on conflict (key) do nothing;
