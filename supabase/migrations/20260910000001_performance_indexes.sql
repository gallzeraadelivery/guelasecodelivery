-- Fase 11: índices para consultas introduzidas nas Fases 9/10 que ainda não
-- tinham suporte de índice — ambas as tabelas crescem a cada operação real
-- da plataforma (toda entrega gera uma linha em wallet_ledger, todo
-- pagamento rejeitado uma linha em payments), então um full scan aqui deixa
-- de ser desprezível rápido.

-- admin_financial_summary() (Fase 10) soma wallet_ledger por type sem
-- filtrar por wallet_id.
create index wallet_ledger_type_idx on public.wallet_ledger (type);

-- listRepeatedPaymentFailures (antifraude, Fase 10) filtra payments por
-- status = 'REJECTED'.
create index payments_status_idx on public.payments (status);
