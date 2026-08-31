"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminSession } from "@/context/session";
import { getAntifraudeFlags, type AntifraudeFlags } from "@/lib/backend";

function formatCents(cents: number | null): string {
  if (cents === null) return "—";
  return `R$ ${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR");
}

export default function AntifraudePage() {
  const { session } = useAdminSession();
  const [flags, setFlags] = useState<AntifraudeFlags | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      setFlags(await getAntifraudeFlags(session.access_token));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <p className="text-sm text-zinc-600 dark:text-zinc-400">Carregando...</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!flags) return null;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Antifraude</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Sinais simples a partir de dados que já existem na plataforma — sem motor de risco automatizado.
        </p>
      </div>

      <section>
        <h3 className="mb-3 text-base font-semibold text-black dark:text-zinc-50">KYC pendente/rejeitado</h3>
        {flags.kyc.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Nenhum entregador flagado.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {flags.kyc.map((item) => (
              <li key={item.driverId} className="rounded border border-zinc-200 p-2 dark:border-zinc-800">
                {item.driverName ?? item.driverId} — <span className="font-mono text-xs">{item.kycStatus}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-3 text-base font-semibold text-black dark:text-zinc-50">Pedidos em disputa</h3>
        {flags.disputedOrders.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Nenhum pedido em disputa.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {flags.disputedOrders.map((item) => (
              <li key={item.orderId} className="rounded border border-zinc-200 p-2 dark:border-zinc-800">
                {item.customerName ?? "Cliente"} · {item.partnerName ?? "Distribuidora"} ·{" "}
                {formatCents(item.totalCents)} · {formatDate(item.createdAt)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-3 text-base font-semibold text-black dark:text-zinc-50">Falhas de pagamento repetidas</h3>
        {flags.repeatedPaymentFailures.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Nenhum cliente com falhas repetidas.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {flags.repeatedPaymentFailures.map((item) => (
              <li key={item.customerId} className="rounded border border-zinc-200 p-2 dark:border-zinc-800">
                {item.customerName ?? item.customerId} — {item.failureCount} falhas
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
