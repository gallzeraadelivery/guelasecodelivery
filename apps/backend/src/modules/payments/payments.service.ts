import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "../../env.js";
import type { NormalizedPaymentStatus, PaymentProvider } from "../../providers/payment-provider.js";
import { transitionOrder } from "../orders/orders.repository.js";
import { OrderNotPayableError, PartnerNotConnectedError } from "./payments.errors.js";

async function loadPayableOrder(db: SupabaseClient, orderId: string, customerId: string) {
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
    .select("access_token, public_key")
    .eq("partner_id", order.partner_id)
    .maybeSingle();

  if (!account) {
    throw new PartnerNotConnectedError(
      "Esta distribuidora ainda não conectou uma conta Mercado Pago para receber pagamentos.",
    );
  }

  return { order, account };
}

async function loadPayerEmail(db: SupabaseClient, customerId: string): Promise<string | undefined> {
  try {
    const { data: userData } = await db.auth.admin.getUserById(customerId);
    return userData.user?.email ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Efeitos colaterais de um pagamento resolvido (aprovado/recusado) sobre o
 * pedido — usado tanto pela resposta síncrona do Checkout API (cartão)
 * quanto pelo webhook assíncrono do Checkout Pro. Idempotente: só transiciona
 * se o pedido ainda estiver em AWAITING_PAYMENT.
 */
async function settleOrderPaymentStatus(
  db: SupabaseClient,
  orderId: string,
  status: NormalizedPaymentStatus,
): Promise<void> {
  const { data: order } = await db.from("orders").select("status").eq("id", orderId).maybeSingle();
  if (!order || order.status !== "AWAITING_PAYMENT") return;

  if (status === "APPROVED") {
    await transitionOrder(db, orderId, "AWAITING_PAYMENT", "PAID", { reason: "payment_approved" });
    await db.rpc("confirm_order_stock", { p_order_id: orderId });
    // Pedido pago já aparece para a distribuidora confirmar (seção 2: "Aceita
    // e prepara" vem antes do dispatch).
    await transitionOrder(db, orderId, "PAID", "PARTNER_CONFIRMATION", { reason: "awaiting_partner" });
  } else if (status === "REJECTED" || status === "CANCELLED") {
    await transitionOrder(db, orderId, "AWAITING_PAYMENT", "PAYMENT_FAILED", {
      reason: `payment_${status.toLowerCase()}`,
    });
    await db.rpc("release_order_stock", { p_order_id: orderId });
  }
}

export async function createCheckoutForOrder(
  db: SupabaseClient,
  provider: PaymentProvider,
  env: Env,
  orderId: string,
  customerId: string,
): Promise<{ checkoutUrl: string }> {
  const { order, account } = await loadPayableOrder(db, orderId, customerId);

  const { data: items } = await db
    .from("order_items")
    .select("quantity, unit_price_cents, catalog_products(name)")
    .eq("order_id", orderId)
    .returns<{ quantity: number; unit_price_cents: number; catalog_products: { name: string } | null }[]>();

  const payerEmail = await loadPayerEmail(db, customerId);

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
 * Public key da distribuidora que vai receber o pagamento — necessária no
 * app ANTES de tokenizar o cartão (Checkout API), já que o token só é
 * aceito por um pagamento criado com o access_token da mesma conta.
 */
export async function getPublicKeyForOrder(
  db: SupabaseClient,
  orderId: string,
  customerId: string,
): Promise<{ publicKey: string }> {
  const { account } = await loadPayableOrder(db, orderId, customerId);
  if (!account.public_key) {
    throw new PartnerNotConnectedError(
      "Esta distribuidora ainda não está pronta para receber pagamentos por cartão.",
    );
  }
  return { publicKey: account.public_key };
}

export type CardPaymentInput = {
  cardToken: string;
  paymentMethodId: string;
  installments: number;
  payerCpf: string;
};

/**
 * Checkout API — cobra o cartão direto (token já gerado no app com a
 * public_key da distribuidora) e devolve o status já resolvido pelo
 * Mercado Pago, sem depender de um redirect/preferência.
 */
export async function createCardPaymentForOrder(
  db: SupabaseClient,
  provider: PaymentProvider,
  env: Env,
  orderId: string,
  customerId: string,
  input: CardPaymentInput,
): Promise<{ status: string; statusDetail: string | null }> {
  const { order, account } = await loadPayableOrder(db, orderId, customerId);
  const payerEmail = await loadPayerEmail(db, customerId);
  const backendUrl = env.BACKEND_PUBLIC_URL as string;

  const payment = await provider.createPayment({
    orderId,
    sellerAccessToken: account.access_token,
    amountCents: order.total_cents ?? 0,
    marketplaceFeeCents: order.service_fee_cents ?? 0,
    description: "Pedido Guela Seco",
    cardToken: input.cardToken,
    paymentMethodId: input.paymentMethodId,
    installments: input.installments,
    payerEmail,
    payerCpf: input.payerCpf,
    notificationUrl: `${backendUrl}/webhooks/mercadopago`,
  });

  await db.from("payments").insert({
    order_id: orderId,
    provider: "mercadopago",
    external_id: payment.externalId,
    gross_amount_cents: order.total_cents,
    marketplace_fee_cents: order.service_fee_cents,
    status: payment.status,
    raw_init_response: payment.raw as never,
  });

  await settleOrderPaymentStatus(db, orderId, payment.status);

  return { status: payment.status, statusDetail: payment.statusDetail };
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

  await settleOrderPaymentStatus(db, orderId, details.status);

  return { orderId };
}
