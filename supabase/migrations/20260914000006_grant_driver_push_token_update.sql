-- A migration que criou drivers.push_token esqueceu de incluir a coluna no
-- GRANT UPDATE restrito por coluna (drivers_and_kyc.sql concede update só
-- em status/cpf/cnh_number/cnh_category) — o entregador tinha a RLS certa
-- (drivers_update_own) mas o Postgres barrava antes disso com "permission
-- denied for table drivers", já que RLS não substitui o GRANT de coluna.
-- Reproduzido agora no teste real via o alerta de diagnóstico.
grant update (push_token) on public.drivers to authenticated;
