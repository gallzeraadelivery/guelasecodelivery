-- Fase 11 (continuação): troca do provedor de KYC de CAF para Sumsub. O CAF
-- (rebrand "Certta") nunca teve autocadastro self-service — exigia contato
-- comercial para gerar credenciais. O Sumsub permite cadastro e credenciais
-- de sandbox imediatas, e a integração foi escrita a partir de documentação
-- real confirmada (Authentication, Create applicant, Add verification
-- documents, Request applicant check, Get applicant review status). Só
-- atualiza o default da coluna para novos registros; nenhum registro
-- histórico existe ainda com KYC real (nem CAF nem Sumsub).

alter table public.kyc_checks alter column provider set default 'sumsub';
