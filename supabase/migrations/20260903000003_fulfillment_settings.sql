-- Fase 4: configurações usadas pelo FulfillmentSelectionService (nunca hardcode
-- no backend — seção 24/28/62 da arquitetura) e helper para ler a localização
-- de um endereço sem expor a coluna `location` diretamente via RLS.

insert into public.platform_settings (key, value, description) values
  (
    'logistics_avg_speed_kmh',
    '25',
    'PLACEHOLDER — velocidade média usada para estimar ETA sem chamar API de rota (distância/velocidade). Ajustar por cidade/horário quando houver dados reais.'
  ),
  (
    'default_preparation_minutes',
    '15',
    'PLACEHOLDER — tempo médio de preparo somado ao ETA de deslocamento quando a distribuidora ainda não tem histórico próprio.'
  )
on conflict (key) do nothing;

create function public.get_address_location(p_address_id uuid)
returns table (lat double precision, lng double precision)
language sql
stable
security definer
set search_path = public
as $$
  select ST_Y(location::geometry), ST_X(location::geometry)
  from public.addresses
  where id = p_address_id and location is not null;
$$;

revoke execute on function public.get_address_location(uuid) from public;
grant execute on function public.get_address_location(uuid) to service_role;
