"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminSession } from "@/context/session";
import {
  BackendError,
  approveWithdrawal,
  failWithdrawal,
  getFinancialSummary,
  listWithdrawals,
  type FinancialSummary,
  type Withdrawal,
} from "@/lib/backend";

function formatCents(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR");
}

const SUMMARY_CARDS: { key: keyof FinancialSummary; label: string; isCents: boolean }[] = [
  { key: "delivered_orders_count", label: "Pedidos entregues", isCents: false },
  { key: "gross_revenue_cents", label: "Receita bruta", isCents: true },
  { key: "service_fee_revenue_cents", label: "Taxa de serviço", isCents: true },
  { key: "delivery_fee_cents", label: "Taxa de entrega", isCents: true },
  { key: "driver_payouts_credited_cents", label: "Creditado a entregadores", isCents: true },
  { key: "withdrawals_paid_cents", label: "Saques pagos", isCents: true },
  { key: "withdrawals_pending_cents", label: "Saques pendentes", isCents: true },
  { key: "withdrawals_pending_count", label: "Saques pendentes (qtd.)", isCents: false },
];

export default function FinanceiroPage() {
  const { session } = useAdminSession();
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const [nextSummary, nextWithdrawals] = await Promise.all([
        getFinancialSummary(session.access_token),
        listWithdrawals(session.access_token, "REQUESTED"),
      ]);
      setSummary(nextSummary);
      setWithdrawals(nextWithdrawals);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleApprove(id: string) {
    if (!session) return;
    setProcessingId(id);
    try {
      await approveWithdrawal(session.access_token, id);
      await load();
    } catch (err) {
      alert(err instanceof BackendError ? err.message : "Falha ao aprovar saque.");
    } finally {
      setProcessingId(null);
    }
  }

  async function handleFail(id: string) {
    const reason = prompt("Motivo da recusa:");
    if (!session || !reason) return;
    setProcessingId(id);
    try {
      await failWithdrawal(session.access_token, id, reason);
      await load();
    } catch (err) {
      alert(err instanceof BackendError ? err.message : "Falha ao recusar saque.");
    } finally {
      setProcessingId(null);
    }
  }

  if (loading) return <p className="text-sm text-zinc-600 dark:text-zinc-400">Carregando...</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!summary) return null;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="mb-4 text-lg font-semibold text-black dark:text-zinc-50">Financeiro</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SUMMARY_CARDS.map((card) => (
            <div key={card.key} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{card.label}</p>
              <p className="mt-1 text-lg font-semibold text-black dark:text-zinc-50">
                {card.isCents ? formatCents(summary[card.key]) : summary[card.key]}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-base font-semibold text-black dark:text-zinc-50">Saques pendentes</h3>
        {withdrawals.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Nenhum saque aguardando processamento.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-100 text-left text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                <tr>
                  <th className="p-3">Entregador</th>
                  <th className="p-3">Valor</th>
                  <th className="p-3">Chave PIX</th>
                  <th className="p-3">Solicitado em</th>
                  <th className="p-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {withdrawals.map((w) => (
                  <tr key={w.id} className="border-t border-zinc-200 dark:border-zinc-800">
                    <td className="p-3">{w.driver_name ?? w.driver_id}</td>
                    <td className="p-3 font-medium">{formatCents(w.amount_cents)}</td>
                    <td className="p-3 font-mono text-xs">
                      {w.pix_key} ({w.pix_key_type})
                    </td>
                    <td className="p-3 text-xs text-zinc-500">{formatDate(w.created_at)}</td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleApprove(w.id)}
                          disabled={processingId === w.id}
                          className="rounded bg-black px-2 py-1 text-xs font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
                        >
                          Aprovar
                        </button>
                        <button
                          onClick={() => handleFail(w.id)}
                          disabled={processingId === w.id}
                          className="rounded border border-red-600 px-2 py-1 text-xs font-medium text-red-600 disabled:opacity-50"
                        >
                          Recusar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
