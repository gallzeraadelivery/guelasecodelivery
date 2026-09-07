-- Fase 11: decisão do provedor de KYC — CAF (Combate à Fraude), não
-- BitcoinP2P (sem documentação confiável, nunca chegou a ser implementado
-- de verdade). Só atualiza o default da coluna para novos registros; nenhum
-- registro histórico existente precisa mudar (nenhum foi criado ainda com
-- KYC real).

alter table public.kyc_checks alter column provider set default 'caf';
