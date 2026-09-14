-- Fase 13 (catálogo estilo Zé Delivery): bucket de fotos de produto e
-- categorias reais (as 3 existentes eram só placeholder de teste).

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

-- Leitura pública (a foto precisa aparecer pro cliente sem autenticação);
-- escrita só pelo backend com service_role (upload é feito pelo admin via
-- rota autenticada, nunca direto do client).
create policy "product_images_public_read" on storage.objects
  for select
  using (bucket_id = 'product-images');

insert into public.categories (name, sort_order) values
  ('Cerveja', 1),
  ('Vinho', 2),
  ('Destilados', 3),
  ('Refrigerante', 4),
  ('Água', 5),
  ('Energético e Isotônico', 6),
  ('Gelo', 7),
  ('Carvão e Churrasco', 8),
  ('Salgadinhos e Petiscos', 9),
  ('Cigarro', 10)
on conflict do nothing;
