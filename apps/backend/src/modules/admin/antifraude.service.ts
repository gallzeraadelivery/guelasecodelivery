import type { SupabaseClient } from "@supabase/supabase-js";
import { getSetting } from "../../lib/settings.js";
import { z } from "zod";

/**
 * Sinais simples de antifraude a partir de dados que já existem (seção
 * financeiro/antifraude do painel admin) — nenhum motor de ML ou regra nova
 * de negócio, só reaproveitar o que já é gravado (KYC, disputas, falhas de
 * pagamento repetidas) para dar visibilidade à administração.
 */

export type KycFlag = {
  driverId: string;
  driverName: string | null;
  kycStatus: string;
};

export async function listKycFlags(db: SupabaseClient): Promise<KycFlag[]> {
  const { data: drivers, error } = await db
    .from("drivers")
    .select("id, kyc_status")
    .in("kyc_status", ["REJECTED", "REVIEW"]);

  if (error) throw new Error(`Falha ao listar flags de KYC: ${error.message}`);
  if (!drivers || drivers.length === 0) return [];

  const { data: profiles } = await db
    .from("profiles")
    .select("id, full_name")
    .in("id", drivers.map((d) => d.id));
  const nameById = new Map((profiles ?? []).map((p) => [p.id as string, p.full_name as string | null]));

  return drivers.map((d) => ({ driverId: d.id, driverName: nameById.get(d.id) ?? null, kycStatus: d.kyc_status }));
}

export type DisputedOrderFlag = {
  orderId: string;
  customerName: string | null;
  partnerName: string | null;
  totalCents: number | null;
  createdAt: string;
};

export async function listDisputedOrders(db: SupabaseClient): Promise<DisputedOrderFlag[]> {
  const { data, error } = await db
    .from("orders")
    .select("id, total_cents, created_at, customer_id, partners(trade_name)")
    .eq("status", "DISPUTED")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(`Falha ao listar pedidos em disputa: ${error.message}`);
  if (!data || data.length === 0) return [];

  const { data: profiles } = await db
    .from("profiles")
    .select("id, full_name")
    .in("id", data.map((o) => o.customer_id));
  const nameById = new Map((profiles ?? []).map((p) => [p.id as string, p.full_name as string | null]));

  return data.map((o) => ({
    orderId: o.id,
    customerName: nameById.get(o.customer_id) ?? null,
    partnerName: (o.partners as unknown as { trade_name: string } | null)?.trade_name ?? null,
    totalCents: o.total_cents,
    createdAt: o.created_at,
  }));
}

export type PaymentFailureFlag = {
  customerId: string;
  customerName: string | null;
  failureCount: number;
};

export async function listRepeatedPaymentFailures(db: SupabaseClient): Promise<PaymentFailureFlag[]> {
  const threshold = await getSetting(db, "antifraude_payment_failure_threshold", z.number().int().positive());

  const { data, error } = await db
    .from("payments")
    .select("status, orders(customer_id)")
    .eq("status", "REJECTED");

  if (error) throw new Error(`Falha ao listar falhas de pagamento: ${error.message}`);
  if (!data || data.length === 0) return [];

  const countByCustomer = new Map<string, number>();
  for (const row of data) {
    const customerId = (row.orders as unknown as { customer_id: string } | null)?.customer_id;
    if (!customerId) continue;
    countByCustomer.set(customerId, (countByCustomer.get(customerId) ?? 0) + 1);
  }

  const flaggedIds = [...countByCustomer.entries()].filter(([, count]) => count >= threshold).map(([id]) => id);
  if (flaggedIds.length === 0) return [];

  const { data: profiles } = await db.from("profiles").select("id, full_name").in("id", flaggedIds);
  const nameById = new Map((profiles ?? []).map((p) => [p.id as string, p.full_name as string | null]));

  return flaggedIds.map((customerId) => ({
    customerId,
    customerName: nameById.get(customerId) ?? null,
    failureCount: countByCustomer.get(customerId) as number,
  }));
}

export type AntifraudeFlags = {
  kyc: KycFlag[];
  disputedOrders: DisputedOrderFlag[];
  repeatedPaymentFailures: PaymentFailureFlag[];
};

export async function getAntifraudeFlags(db: SupabaseClient): Promise<AntifraudeFlags> {
  const [kyc, disputedOrders, repeatedPaymentFailures] = await Promise.all([
    listKycFlags(db),
    listDisputedOrders(db),
    listRepeatedPaymentFailures(db),
  ]);

  return { kyc, disputedOrders, repeatedPaymentFailures };
}
