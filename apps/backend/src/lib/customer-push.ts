import type { SupabaseClient } from "@supabase/supabase-js";
import { sendExpoPushNotification } from "./push.js";

/**
 * Só os status realmente relevantes pro cliente acompanhar geram
 * notificação — os intermediários do checkout (FULFILLMENT_SELECTED,
 * STOCK_RESERVED, AWAITING_PAYMENT, ACCEPTED, READY_FOR_PICKUP,
 * DRIVER_TO_PICKUP, IN_DELIVERY) acontecem quase simultaneamente e só
 * gerariam spam de notificação.
 */
const CUSTOMER_STATUS_MESSAGES: Partial<Record<string, string>> = {
  PAID: "Pagamento confirmado! Seu pedido foi enviado pra distribuidora.",
  PARTNER_CONFIRMATION: "Pagamento confirmado! Seu pedido foi enviado pra distribuidora.",
  PREPARING: "Seu pedido está sendo preparado.",
  SEARCHING_DRIVER: "Procurando um entregador pra você.",
  DRIVER_ASSIGNED: "Entregador encontrado! Ele já está a caminho da distribuidora.",
  PICKED_UP: "Seu pedido foi retirado e está a caminho!",
  DELIVERED: "Pedido entregue! Aproveite 🍻",
  CANCELLED: "Seu pedido foi cancelado.",
};

async function sendToOrderCustomer(
  db: SupabaseClient,
  orderId: string,
  message: string,
  data?: Record<string, unknown>,
): Promise<void> {
  const { data: order } = await db.from("orders").select("customer_id").eq("id", orderId).maybeSingle();
  if (!order?.customer_id) return;

  const { data: customer } = await db
    .from("customers")
    .select("push_token")
    .eq("id", order.customer_id)
    .maybeSingle();

  if (customer?.push_token) {
    await sendExpoPushNotification(customer.push_token, "GUELA SECO", message, data);
  }
}

export async function notifyCustomerOfOrderStatus(
  db: SupabaseClient,
  orderId: string,
  status: string,
): Promise<void> {
  let message = CUSTOMER_STATUS_MESSAGES[status];
  if (!message) return;

  if (status === "CANCELLED") {
    const { data: order } = await db
      .from("orders")
      .select("cancellation_reason")
      .eq("id", orderId)
      .maybeSingle();
    if (order?.cancellation_reason) {
      message = `Seu pedido foi cancelado pela distribuidora: ${order.cancellation_reason}`;
    }
  }

  await sendToOrderCustomer(db, orderId, message, { orderId, status });
}

export async function notifyCustomerApproaching(db: SupabaseClient, orderId: string): Promise<void> {
  await sendToOrderCustomer(db, orderId, "Seu entregador está chegando! Só mais alguns minutinhos. 🛵", { orderId });
}
