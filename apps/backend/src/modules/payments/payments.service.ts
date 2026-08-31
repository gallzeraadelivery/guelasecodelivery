import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "../../env.js";
import type { PaymentProvider } from "../../providers/payment-provider.js";
import { transitionOrder } from "../orders/orders.repository.js";
import { OrderNotPayableError, PartnerNotConnectedError } from "./payments.errors.js";

export async function createCheckoutForOrder(
  db: SupabaseClient,
  provider: PaymentProvider,
  env: Env,
  orderId: string,
  customerId: string,
): Promise<{ checkoutUrl: string }> {
  const { data: order, error: orderError } = await db
    .from("orders")
    .select("id, partner_id, status, total_cents, service_fee_cents")
    .eq("id", orderId)
    .eq("customer_id", customerId)
    .maybeSingle();

  if (orderError || !order) {
    throw new OrderNotPayableError("Pedido não encontrado.");
  }
  if (order.status !== "AWAITING_PAYMENT" || !order.partner_id || order.total_cents == null) {
    throw new OrderNotPayableError("Este pedido não está aguardando pagamento.");
  }

  const { data: account } = await db
    .from("partner_payment_accounts")
    .select("access_token")
    .eq("partner_id", order.partner_id)
    .maybeSingle();

  if (!account) {
    throw new PartnerNotConnectedError(
      "Esta distribuidora ainda não conectou uma conta Mercado Pago para receber pagamentos.",
    );
  }

  const { data: items } = await db
    .from("order_items")
    .select("quantity, unit_price_cents, catalog_products(name)")
    .eq("order_id", orderId)
    .returns<{ quantity: number; unit_price_cents: number; catalog_products: { name: string } | null }[]>();

  let payerEmail: string | undefined;
  try {
    const { data: userData } = await db.auth.admin.getUserById(customerId);
    payerEmail = userData.user?.email ?? undefined;
  } catch {
    payerEmail = undefined;
  }

  const backendUrl = env.BACKEND_PUBLIC_URL as string;

  const checkout = await provider.createCheckout({
    orderId,
    sellerAccessToken: account.access_token,
    items: (items ?? []).map((item) => ({
      title: item.catalog_products?.name ?? "Produto",
      quantity: item.quantity,
      unitPriceCents: item.unit_price_cents ?? 0,
    })),
    marketplaceFeeCents: order.service_fee_cents ?? 0,
    payerEmail,
    notificationUrl: `${backendUrl}/webhooks/mercadopago`,
    backUrls: {
      success: `guelaseco://order/${orderId}?status=success`,
      failure: `guelaseco://order/${orderId}?status=failure`,
      pending: `guelaseco://order/${orderId}?status=pending`,
    },
  });

  await db.from("payments").insert({
    order_id: orderId,
    provider: "mercadopago",
    external_id: checkout.externalId,
    gross_amount_cents: order.total_cents,
    marketplace_fee_cents: order.service_fee_cents,
    status: "PENDING",
    checkout_url: checkout.checkoutUrl,
    raw_init_response: checkout.raw as never,
  });

  return { checkoutUrl: checkout.checkoutUrl };
}

/**
 * Processa um evento de webhook já deduplicado (seção 23) — quem chama
 * decide o que fazer com o retorno; nunca lança para status normais
 * (pending/in_process), só quando algo impede identificar o pedido.
 */
export async function applyPaymentWebhookEvent(
  db: SupabaseClient,
  provider: PaymentProvider,
  paymentExternalId: string,
): Promise<{ orderId: string | null }> {
  const appToken = await provider.getAppAccessToken();
  const details = await provider.getPaymentDetails(paymentExternalId, appToken);

  if (!details.externalReference) {
    return { orderId: null };
  }

  const orderId = details.externalReference;

  const { data: existingPayment } = await db
    .from("payments")
    .select("id, status")
    .eq("provider", "mercadopago")
    .eq("external_id", paymentExternalId)
    .maybeSingle();

  const paymentRow = {
    order_id: orderId,
    provider: "mercadopago",
    external_id: paymentExternalId,
    payment_method: details.paymentMethod,
    gross_amount_cents: details.grossAmountCents,
    gateway_fee_cents: details.gatewayFeeCents,
    marketplace_fee_cents: details.marketplaceFeeCents,
    net_amount_cents: details.netAmountCents,
    status: details.status,
    raw_init_response: details.raw as never,
  };

  if (existingPayment) {
    if (existingPayment.status === details.status) {
      // Já processado com o mesmo status — nada a fazer (idempotência).
      return { orderId };
    }
    await db.from("payments").update(paymentRow).eq("id", existingPayment.id);
  } else {
    await db.from("payments").insert(paymentRow);
  }

  const { data: order } = await db.from("orders").select("status").eq("id", orderId).maybeSingle();
  if (!order) return { orderId };

  if (details.status === "APPROVED" && order.status === "AWAITING_PAYMENT") {
    await transitionOrder(db, orderId, "AWAITING_PAYMENT", "PAID", { reason: "payment_approved" });
    await db.rpc("confirm_order_stock", { p_order_id: orderId });
  } else if (
    (details.status === "REJECTED" || details.status === "CANCELLED") &&
    order.status === "AWAITING_PAYMENT"
  ) {
    await transitionOrder(db, orderId, "AWAITING_PAYMENT", "PAYMENT_FAILED", {
      reason: `payment_${details.status.toLowerCase()}`,
    });
    await db.rpc("release_order_stock", { p_order_id: orderId });
  }

  return { orderId };
}
