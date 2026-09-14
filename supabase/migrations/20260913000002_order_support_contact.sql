-- Contato de suporte (tela de detalhe do pedido / cancelamento) — seção
-- decidida em conversa: primeiro contato é com a distribuidora, depois com
-- o suporte da plataforma.

alter table public.partners add column phone text;

insert into public.platform_settings (key, value, description) values
  (
    'support_contact',
    '{"whatsapp": "5565999999999"}',
    'PLACEHOLDER — número de WhatsApp (só dígitos, com DDI/DDD) do suporte GUELA SECO, usado no app do cliente como segundo contato (depois da distribuidora). Trocar pelo número real antes de produção.'
  )
on conflict (key) do nothing;
