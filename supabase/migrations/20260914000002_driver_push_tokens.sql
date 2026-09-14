-- Notificação push pro entregador quando uma nova corrida é oferecida —
-- sem isso ele só descobre se estiver olhando o app no momento certo (a
-- oferta expira em segundos/minutos).

alter table public.drivers add column push_token text;
