import type { SupabaseClient } from "@supabase/supabase-js";
import { assertValidTransition, type OrderStatus } from "./order-state-machine.js";

export async function transitionOrder(
  db: SupabaseClient,
  orderId: string,
  from: OrderStatus,
  to: OrderStatus,
  options: { actor?: string; reason?: string; metadata?: Record<string, unknown> } = {},
): Promise<void> {
  assertValidTransition(from, to);

  const { error: updateError } = await db.from("orders").update({ status: to }).eq("id", orderId);
  if (updateError) {
    throw new Error(`Falha ao atualizar status do pedido: ${updateError.message}`);
  }

  const { error: historyError } = await db.from("order_status_history").insert({
    order_id: orderId,
    previous_status: from,
    new_status: to,
    actor: options.actor ?? "system",
    reason: options.reason ?? null,
    metadata: options.metadata ?? null,
  });
  if (historyError) {
    throw new Error(`Falha ao registrar histórico do pedido: ${historyError.message}`);
  }
}
