-- Dados de DEMONSTRAÇÃO para desenvolvimento local (supabase db reset).
-- Nunca rodar em staging/production. Nenhum valor aqui é uma decisão comercial.

insert into public.categories (id, name, sort_order) values
  ('00000000-0000-0000-0000-000000000001', 'Cervejas', 1),
  ('00000000-0000-0000-0000-000000000002', 'Refrigerantes', 2),
  ('00000000-0000-0000-0000-000000000003', 'Gelo e Carvão', 3)
on conflict (id) do nothing;

insert into public.catalog_products
  (id, name, brand, category_id, unit, volume_ml, alcohol_content_pct, requires_age_verification)
values
  ('00000000-0000-0000-0000-000000000011', 'Heineken Long Neck 330ml', 'Heineken',
    '00000000-0000-0000-0000-000000000001', 'un', 330, 5.0, true),
  ('00000000-0000-0000-0000-000000000012', 'Coca-Cola 2L', 'Coca-Cola',
    '00000000-0000-0000-0000-000000000002', 'un', 2000, 0.0, false),
  ('00000000-0000-0000-0000-000000000013', 'Saco de Gelo 5kg', null,
    '00000000-0000-0000-0000-000000000003', 'un', null, 0.0, false),
  ('00000000-0000-0000-0000-000000000014', 'Saco de Carvão 3kg', null,
    '00000000-0000-0000-0000-000000000003', 'un', null, 0.0, false)
on conflict (id) do nothing;

-- Distribuidora demo em Cuiabá/MT (coordenadas aproximadas do centro da cidade).
insert into public.partners (id, legal_name, trade_name, document, status, address_line, location)
values (
  '00000000-0000-0000-0000-000000000021',
  'Distribuidora Demo LTDA',
  'Distribuidora Demo',
  '00000000000100',
  'ONLINE',
  'Av. Historiador Rubens de Mendonça, Cuiabá/MT',
  ST_SetSRID(ST_MakePoint(-56.0966, -15.6014), 4326)::geography
)
on conflict (id) do nothing;

insert into public.service_areas (partner_id, center, radius_km)
values (
  '00000000-0000-0000-0000-000000000021',
  ST_SetSRID(ST_MakePoint(-56.0966, -15.6014), 4326)::geography,
  8
)
on conflict do nothing;

insert into public.partner_hours (partner_id, weekday, opens_at, closes_at)
select '00000000-0000-0000-0000-000000000021', weekday, '10:00', '23:00'
from generate_series(0, 6) as weekday
on conflict do nothing;

insert into public.partner_products (id, partner_id, catalog_product_id, price_cents)
values
  ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000021',
    '00000000-0000-0000-0000-000000000011', 890),
  ('00000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000021',
    '00000000-0000-0000-0000-000000000012', 990),
  ('00000000-0000-0000-0000-000000000033', '00000000-0000-0000-0000-000000000021',
    '00000000-0000-0000-0000-000000000013', 1200),
  ('00000000-0000-0000-0000-000000000034', '00000000-0000-0000-0000-000000000021',
    '00000000-0000-0000-0000-000000000014', 2500)
on conflict (id) do nothing;

update public.inventory set stock_quantity = 50
where partner_product_id in (
  '00000000-0000-0000-0000-000000000031',
  '00000000-0000-0000-0000-000000000032',
  '00000000-0000-0000-0000-000000000033',
  '00000000-0000-0000-0000-000000000034'
);

-- Para logar no painel parceiro localmente com este partner: crie um usuário via
-- Supabase Auth (studio local ou `supabase.auth.signUp`), depois vincule-o com:
--   insert into public.partner_users (profile_id, partner_id, role)
--   values ('<id-do-usuario-criado>', '00000000-0000-0000-0000-000000000021', 'owner');
