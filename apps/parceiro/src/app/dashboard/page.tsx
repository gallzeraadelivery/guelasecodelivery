"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { PartnerProductWithStock } from "@/lib/types";

type EditableRow = PartnerProductWithStock & {
  draftPriceReais: string;
  draftStock: string;
  saving: boolean;
};

type PartnerOrder = {
  id: string;
  status: string;
  total_cents: number | null;
  created_at: string;
};

const ORDER_ACTIONABLE_STATUSES = ["PARTNER_CONFIRMATION", "PREPARING"];

function centsToReais(cents: number): string {
  return (cents / 100).toFixed(2);
}

function reaisToCents(value: string): number | null {
  const parsed = Number(value.replace(",", "."));
  if (Number.isNaN(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [partnerName, setPartnerName] = useState<string | null>(null);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [mpConnected, setMpConnected] = useState(false);
  const [connectingMp, setConnectingMp] = useState(false);
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [orders, setOrders] = useState<PartnerOrder[]>([]);
  const [processingOrderId, setProcessingOrderId] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      router.replace("/login");
      return;
    }

    const { data: membership, error: membershipError } = await supabase
      .from("partner_users")
      .select("partner_id, partners(trade_name, mercadopago_account_id)")
      .eq("profile_id", session.user.id)
      .maybeSingle<{
        partner_id: string;
        partners: { trade_name: string; mercadopago_account_id: string | null } | null;
      }>();

    if (membershipError) {
      setError(membershipError.message);
      setLoading(false);
      return;
    }

    if (!membership) {
      setError("Seu usuário não está vinculado a nenhuma distribuidora.");
      setLoading(false);
      return;
    }

    setPartnerId(membership.partner_id);
    setPartnerName(membership.partners?.trade_name ?? null);
    setMpConnected(Boolean(membership.partners?.mercadopago_account_id));

    const { data: products, error: productsError } = await supabase
      .from("partner_products")
      .select(
        "id, price_cents, promotional_price_cents, available, catalog_products(name, brand), inventory(stock_quantity, reserved_quantity)",
      )
      .eq("partner_id", membership.partner_id)
      .returns<PartnerProductWithStock[]>();

    if (productsError) {
      setError(productsError.message);
      setLoading(false);
      return;
    }

    setRows(
      (products ?? []).map((product) => ({
        ...product,
        draftPriceReais: centsToReais(product.price_cents),
        draftStock: String(product.inventory?.stock_quantity ?? 0),
        saving: false,
      })),
    );

    const { data: partnerOrders } = await supabase
      .from("orders")
      .select("id, status, total_cents, created_at")
      .eq("partner_id", membership.partner_id)
      .in("status", ORDER_ACTIONABLE_STATUSES)
      .order("created_at", { ascending: true })
      .returns<PartnerOrder[]>();

    setOrders(partnerOrders ?? []);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  function updateRow(id: string, patch: Partial<EditableRow>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  async function saveRow(row: EditableRow) {
    const priceCents = reaisToCents(row.draftPriceReais);
    const stockQuantity = Number.parseInt(row.draftStock, 10);

    if (priceCents === null || Number.isNaN(stockQuantity) || stockQuantity < 0) {
      updateRow(row.id, {});
      setError("Preço ou estoque inválido.");
      return;
    }

    updateRow(row.id, { saving: true });
    setError(null);

    const [{ error: priceError }, { error: stockError }] = await Promise.all([
      supabase
        .from("partner_products")
        .update({ price_cents: priceCents, available: row.available })
        .eq("id", row.id),
      supabase.from("inventory").update({ stock_quantity: stockQuantity }).eq("partner_product_id", row.id),
    ]);

    if (priceError || stockError) {
      setError(priceError?.message ?? stockError?.message ?? "Falha ao salvar.");
      updateRow(row.id, { saving: false });
      return;
    }

    updateRow(row.id, {
      saving: false,
      price_cents: priceCents,
      inventory: { ...row.inventory, stock_quantity: stockQuantity, reserved_quantity: row.inventory?.reserved_quantity ?? 0 },
    });
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  async function handleConnectMercadoPago() {
    if (!partnerId) return;
    setConnectingMp(true);
    setError(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      router.replace("/login");
      return;
    }

    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3333";
      const response = await fetch(`${backendUrl}/partners/${partnerId}/mercadopago/connect`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const body = await response.json();

      if (!response.ok) {
        setError(body.error ?? "Falha ao iniciar conexão com o Mercado Pago.");
        return;
      }

      window.location.href = body.url;
    } catch {
      setError("Não foi possível conectar ao backend agora.");
    } finally {
      setConnectingMp(false);
    }
  }

  async function handleOrderAction(orderId: string, action: "accept" | "ready") {
    setProcessingOrderId(orderId);
    setError(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      router.replace("/login");
      return;
    }

    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3333";
      const response = await fetch(`${backendUrl}/orders/${orderId}/${action}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const body = await response.json();

      if (!response.ok) {
        setError(body.error ?? "Falha ao atualizar o pedido.");
        return;
      }

      await loadDashboard();
    } catch {
      setError("Não foi possível conectar ao backend agora.");
    } finally {
      setProcessingOrderId(null);
    }
  }

  if (loading) {
    return <div className="p-8 text-sm text-zinc-600 dark:text-zinc-400">Carregando...</div>;
  }

  if (error && !partnerId) {
    return (
      <div className="p-8">
        <p className="text-sm text-red-600">{error}</p>
        <button onClick={handleSignOut} className="mt-4 text-sm underline">
          Sair
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-6 dark:bg-black">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-black dark:text-zinc-50">
              {partnerName ?? "Painel Parceiro"}
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Catálogo e estoque</p>
          </div>
          <div className="flex items-center gap-3">
            {mpConnected ? (
              <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800">
                Mercado Pago conectado
              </span>
            ) : (
              <button
                onClick={handleConnectMercadoPago}
                disabled={connectingMp}
                className="rounded bg-[#009ee3] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {connectingMp ? "Conectando..." : "Conectar Mercado Pago"}
              </button>
            )}
            <button
              onClick={handleSignOut}
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-black dark:border-zinc-700 dark:text-zinc-50"
            >
              Sair
            </button>
          </div>
        </header>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Pedidos</h2>
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
                  <th className="px-4 py-2">Pedido</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Total</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-zinc-500">
                      Nenhum pedido aguardando ação.
                    </td>
                  </tr>
                )}
                {orders.map((order) => (
                  <tr key={order.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-900">
                    <td className="px-4 py-2 font-mono text-xs text-black dark:text-zinc-50">
                      {order.id.slice(0, 8)}
                    </td>
                    <td className="px-4 py-2 text-black dark:text-zinc-50">{order.status}</td>
                    <td className="px-4 py-2 text-black dark:text-zinc-50">
                      {order.total_cents != null ? `R$ ${(order.total_cents / 100).toFixed(2)}` : "—"}
                    </td>
                    <td className="px-4 py-2">
                      <button
                        onClick={() =>
                          handleOrderAction(order.id, order.status === "PARTNER_CONFIRMATION" ? "accept" : "ready")
                        }
                        disabled={processingOrderId === order.id}
                        className="rounded bg-black px-3 py-1 text-xs font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
                      >
                        {processingOrderId === order.id
                          ? "Enviando..."
                          : order.status === "PARTNER_CONFIRMATION"
                            ? "Aceitar"
                            : "Pedido pronto"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
                <th className="px-4 py-2">Produto</th>
                <th className="px-4 py-2">Preço (R$)</th>
                <th className="px-4 py-2">Estoque</th>
                <th className="px-4 py-2">Disponível</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-zinc-500">
                    Nenhum produto cadastrado ainda.
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-900">
                  <td className="px-4 py-2 text-black dark:text-zinc-50">
                    {row.catalog_products?.name ?? "—"}
                    {row.catalog_products?.brand && (
                      <span className="ml-1 text-xs text-zinc-500">({row.catalog_products.brand})</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <input
                      value={row.draftPriceReais}
                      onChange={(event) => updateRow(row.id, { draftPriceReais: event.target.value })}
                      className="w-24 rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      value={row.draftStock}
                      onChange={(event) => updateRow(row.id, { draftStock: event.target.value })}
                      className="w-20 rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="checkbox"
                      checked={row.available}
                      onChange={(event) => updateRow(row.id, { available: event.target.checked })}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => saveRow(row)}
                      disabled={row.saving}
                      className="rounded bg-black px-3 py-1 text-xs font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
                    >
                      {row.saving ? "Salvando..." : "Salvar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
