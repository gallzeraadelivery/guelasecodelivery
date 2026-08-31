-- Fase 5: credenciais OAuth da distribuidora no Mercado Pago.
--
-- Tabela separada de `partners` de propósito: access_token/refresh_token são
-- segredos — nunca devem estar acessíveis nem para o próprio partner_user via
-- RLS (a distribuidora não precisa nunca ler o token bruto, só saber que está
-- conectada, o que `partners.mercadopago_account_id` já indica). Sem NENHUMA
-- policy de leitura: só service_role toca esta tabela.
create table public.partner_payment_accounts (
  partner_id uuid primary key references public.partners (id) on delete cascade,
  provider text not null default 'mercadopago',
  external_user_id text not null,
  access_token text not null,
  refresh_token text,
  public_key text,
  scope text,
  token_expires_at timestamptz,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger partner_payment_accounts_set_updated_at
  before update on public.partner_payment_accounts
  for each row execute function public.set_updated_at();

alter table public.partner_payment_accounts enable row level security;
-- Nenhuma policy criada de propósito — RLS habilitada sem policies bloqueia
-- tudo que não seja service_role (que ignora RLS).
