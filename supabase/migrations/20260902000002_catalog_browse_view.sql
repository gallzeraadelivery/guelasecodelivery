-- Fase 3: catálogo público para navegação do cliente.
--
-- partner_products e inventory guardam dados comercialmente sensíveis por
-- distribuidora (preço exato de cada uma, estoque exato) e por isso não têm
-- policy de leitura pública (Fase 2). O cliente só precisa, para navegar o
-- catálogo, de um preço indicativo e se há alguma distribuidora com estoque —
-- não de qual distribuidora nem do estoque exato (isso é decidido pelo
-- FulfillmentSelectionService no backend, com service_role, na Fase 4).
--
-- Por isso catalog_browse é uma view comum (sem security_invoker), que no
-- Postgres roda com o privilégio do dono da view — aqui, o mesmo role que
-- também é dono das tabelas base e portanto ignora RLS por padrão. Isso é
-- intencional: é o mecanismo pelo qual expomos um resumo agregado e seguro
-- sem afrouxar o RLS das tabelas de origem. Qualquer revisão de segurança
-- deve tratar isto como esperado, não como um "RLS ausente".
create view public.catalog_browse as
select
  cp.id as catalog_product_id,
  cp.name,
  cp.brand,
  cp.description,
  cp.image_url,
  cp.category_id,
  cp.unit,
  cp.volume_ml,
  cp.requires_age_verification,
  min(pp.price_cents) filter (
    where pp.available
      and pr.status = 'ONLINE'
      and (i.stock_quantity - i.reserved_quantity) > 0
  ) as min_price_cents,
  bool_or(
    pp.available
    and pr.status = 'ONLINE'
    and (i.stock_quantity - i.reserved_quantity) > 0
  ) as in_stock
from public.catalog_products cp
left join public.partner_products pp on pp.catalog_product_id = cp.id
left join public.partners pr on pr.id = pp.partner_id
left join public.inventory i on i.partner_product_id = pp.id
where cp.active
group by cp.id;

grant select on public.catalog_browse to anon, authenticated;
