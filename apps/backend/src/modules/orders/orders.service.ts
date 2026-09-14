import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getSetting, serviceFeeRuleSchema } from "../../lib/settings.js";
import { selectFulfillmentPartner } from "../fulfillment/selection.service.js";
import type { CartItemInput, EvaluatedCandidate } from "../fulfillment/types.js";
import { computeServiceFeeCents } from "./pricing.js";
import { transitionOrder } from "./orders.repository.js";
import type { OrderStatus } from "./order-state-machine.js";
import {
  AddressWithoutLocationError,
  EmptyCartError,
  NoEligiblePartnerError,
  OrderNotCancellableError,
  OrderNotFoundError,
  StockConflictError,
} from "./orders.errors.js";

/**
 * Status em que o cliente ainda pode cancelar direto pelo app — antes da
 * distribuidora aceitar o pedido. Depois disso (ACCEPTED em diante), o
 * cancelamento exige contato (distribuidora, depois suporte), já que ela
 * pode já ter começado o preparo.
 */
const CUSTOMER_CANCELLABLE_STATUSES: OrderStatus[] = [
  "CREATED",
  "FULFILLMENT_SELECTED",
  "STOCK_RESERVED",
  "AWAITING_PAYMENT",
  "PARTNER_CONFIRMATION",
];

/**
 * Traduz o motivo de eliminação num aviso específico pro cliente — a
 * mensagem genérica "sem cobertura" confundia quando o motivo real era a
 * distribuidora estar fechada ou sem estoque, não falta de área de entrega.
 * Só dá um motivo específico quando TODOS os candidatos foram eliminados
 * pelo mesmo motivo; com motivos mistos ou nenhum candidato na região,
 * mantém a mensagem genérica.
 */
function describeNoEligiblePartner(candidates: EvaluatedCandidate[]): string {
  if (candidates.length === 0) {
    return "Nenhuma distribuidora atende essa região ainda.";
  }

  const reasons = new Set(candidates.map((c) => c.eliminationReason?.split(":")[0]));
  if (reasons.size === 1) {
    const reason = [...reasons][0];
    if (reason === "partner_closed") {
      return "A distribuidora mais próxima está fechada no momento. Tente novamente durante o horário de funcionamento.";
    }
    if (reason === "partner_offline") {
      return "A distribuidora mais próxima está temporariamente indisponível.";
    }
    if (reason === "missing_product") {
      return "Um ou mais produtos do carrinho estão sem estoque na distribuidora mais próxima.";
    }
  }

  return "Nenhuma distribuidora consegue atender 100% do seu carrinho nesta região agora.";
}

export type OrderPaymentMethod = "ONLINE" | "CASH_ON_DELIVERY";

export type CreateOrderInput = {
  customerId: string;
  addressId: string;
  items: CartItemInput[];
  paymentMethod: OrderPaymentMethod;
};

export type CreateOrderResult = {
  orderId: string;
  status: "AWAITING_PAYMENT" | "PARTNER_CONFIRMATION";
  partner: { id: string; tradeName: string };
  etaMinutes: number;
  distanceKm: number;
  subtotalCents: number;
  serviceFeeCents: number;
  totalCents: number;
};

export async function createOrder(db: SupabaseClient, input: CreateOrderInput): Promise<CreateOrderResult> {
  if (input.items.length === 0) {
    throw new EmptyCartError("O carrinho está vazio.");
  }

  const { data: location, error: locationError } = await db
    .rpc("get_address_location", { p_address_id: input.addressId })
    .maybeSingle<{ lat: number; lng: number }>();

  if (locationError || !location) {
    throw new AddressWithoutLocationError(
      "Endereço sem localização definida. Use o GPS ou informe um endereço geocodificado.",
    );
  }

  const { data: order, error: orderError } = await db
    .from("orders")
    .insert({
      customer_id: input.customerId,
      address_id: input.addressId,
      status: "CREATED",
      payment_method: input.paymentMethod,
    })
    .select("id")
    .single();

  if (orderError || !order) {
    throw new Error(`Falha ao criar pedido: ${orderError?.message}`);
  }

  const orderId = order.id as string;

  const { error: itemsError } = await db.from("order_items").insert(
    input.items.map((item) => ({
      order_id: orderId,
      catalog_product_id: item.catalogProductId,
      quantity: item.quantity,
    })),
  );
  if (itemsError) {
    throw new Error(`Falha ao registrar itens do pedido: ${itemsError.message}`);
  }

  const selection = await selectFulfillmentPartner(db, {
    lat: location.lat,
    lng: location.lng,
    items: input.items,
  });

  if (selection.candidates.length > 0) {
    await db.from("fulfillment_candidates").insert(
      selection.candidates.map((candidate) => ({
        order_id: orderId,
        partner_id: candidate.partnerId,
        eligible: candidate.eligible,
        elimination_reason: candidate.eliminationReason,
        distance_km: candidate.distanceKm,
        eta_minutes: candidate.etaMinutes,
        score: candidate.score,
      })),
    );
  }

  if (!selection.winner) {
    await transitionOrder(db, orderId, "CREATED", "CANCELLED", {
      reason: "no_eligible_partner",
      metadata: { candidates: selection.candidates.length },
    });
    throw new NoEligiblePartnerError(describeNoEligiblePartner(selection.candidates));
  }

  const winner = selection.winner;

  await db
    .from("orders")
    .update({ partner_id: winner.partnerId, algorithm_version: selection.algorithmVersion })
    .eq("id", orderId);

  await transitionOrder(db, orderId, "CREATED", "FULFILLMENT_SELECTED", {
    reason: "fulfillment_selected",
    metadata: { partner_id: winner.partnerId, eta_minutes: winner.etaMinutes },
  });

  await db.from("fulfillment_decisions").insert({
    order_id: orderId,
    partner_id: winner.partnerId,
    algorithm_version: selection.algorithmVersion,
    distance_km: winner.distanceKm,
    eta_minutes: winner.etaMinutes,
    score: winner.score,
  });

  const reservationExpirationMinutes = await getSetting(
    db,
    "inventory_reservation_expiration_minutes",
    z.number().positive(),
  );

  const { error: reserveError } = await db.rpc("reserve_order_stock", {
    p_order_id: orderId,
    p_partner_id: winner.partnerId,
    p_expires_minutes: reservationExpirationMinutes,
  });

  if (reserveError) {
    await transitionOrder(db, orderId, "FULFILLMENT_SELECTED", "CANCELLED", {
      reason: "stock_conflict",
      metadata: { detail: reserveError.message },
    });
    throw new StockConflictError(
      "O estoque mudou entre a seleção e a reserva. Tente novamente.",
    );
  }

  await transitionOrder(db, orderId, "FULFILLMENT_SELECTED", "STOCK_RESERVED", {
    reason: "stock_reserved",
  });

  const { data: reservedItems, error: reservedItemsError } = await db
    .from("order_items")
    .select("quantity, unit_price_cents")
    .eq("order_id", orderId);

  if (reservedItemsError || !reservedItems) {
    throw new Error(`Falha ao ler itens reservados do pedido: ${reservedItemsError?.message}`);
  }

  const subtotalCents = reservedItems.reduce(
    (sum, item) => sum + (item.unit_price_cents ?? 0) * item.quantity,
    0,
  );

  const serviceFeeRule = await getSetting(db, "platform_service_fee", serviceFeeRuleSchema);
  const serviceFeeCents = computeServiceFeeCents(subtotalCents, serviceFeeRule);
  const totalCents = subtotalCents + serviceFeeCents;

  await db
    .from("orders")
    .update({
      subtotal_cents: subtotalCents,
      service_fee_cents: serviceFeeCents,
      total_cents: totalCents,
      pricing_snapshot: { service_fee_rule: serviceFeeRule, algorithm_version: selection.algorithmVersion },
    })
    .eq("id", orderId);

  await transitionOrder(db, orderId, "STOCK_RESERVED", "AWAITING_PAYMENT", {
    reason: "awaiting_payment",
  });

  if (input.paymentMethod === "CASH_ON_DELIVERY") {
    // Sem gateway envolvido — o dinheiro só existe de verdade na entrega
    // (seção decidida em conversa), mas o pedido já libera pra distribuidora
    // preparar, igual a um pagamento online aprovado.
    await transitionOrder(db, orderId, "AWAITING_PAYMENT", "PAID", { reason: "cash_on_delivery" });
    await db.rpc("confirm_order_stock", { p_order_id: orderId });
    await transitionOrder(db, orderId, "PAID", "PARTNER_CONFIRMATION", { reason: "awaiting_partner" });

    await db.from("payments").insert({
      order_id: orderId,
      provider: "cash_on_delivery",
      gross_amount_cents: totalCents,
      status: "PENDING",
    });

    return {
      orderId,
      status: "PARTNER_CONFIRMATION",
      partner: { id: winner.partnerId, tradeName: winner.tradeName },
      etaMinutes: winner.etaMinutes as number,
      distanceKm: winner.distanceKm,
      subtotalCents,
      serviceFeeCents,
      totalCents,
    };
  }

  return {
    orderId,
    status: "AWAITING_PAYMENT",
    partner: { id: winner.partnerId, tradeName: winner.tradeName },
    etaMinutes: winner.etaMinutes as number,
    distanceKm: winner.distanceKm,
    subtotalCents,
    serviceFeeCents,
    totalCents,
  };
}

export type OrderDetails = {
  orderId: string;
  status: string;
  paymentMethod: string;
  partner: { tradeName: string; phone: string | null; addressLine: string | null } | null;
  etaMinutes: number | null;
  items: { name: string; quantity: number; unitPriceCents: number | null }[];
  subtotalCents: number | null;
  serviceFeeCents: number | null;
  deliveryFeeCents: number | null;
  totalCents: number | null;
  createdAt: string;
  canCancel: boolean;
};

export async function getOrderDetails(
  db: SupabaseClient,
  orderId: string,
  customerId: string,
): Promise<OrderDetails> {
  const { data: order, error } = await db
    .from("orders")
    .select(
      "id, status, payment_method, partner_id, subtotal_cents, service_fee_cents, delivery_fee_cents, total_cents, created_at",
    )
    .eq("id", orderId)
    .eq("customer_id", customerId)
    .maybeSingle();

  if (error || !order) {
    throw new OrderNotFoundError("Pedido não encontrado.");
  }

  let partner: OrderDetails["partner"] = null;
  if (order.partner_id) {
    const { data: partnerRow } = await db
      .from("partners")
      .select("trade_name, phone, address_line")
      .eq("id", order.partner_id)
      .maybeSingle();
    if (partnerRow) {
      partner = {
        tradeName: partnerRow.trade_name,
        phone: partnerRow.phone,
        addressLine: partnerRow.address_line,
      };
    }
  }

  const { data: decision } = await db
    .from("fulfillment_decisions")
    .select("eta_minutes")
    .eq("order_id", orderId)
    .maybeSingle();

  const { data: items } = await db
    .from("order_items")
    .select("quantity, unit_price_cents, catalog_products(name)")
    .eq("order_id", orderId)
    .returns<{ quantity: number; unit_price_cents: number | null; catalog_products: { name: string } | null }[]>();

  return {
    orderId: order.id,
    status: order.status,
    paymentMethod: order.payment_method,
    partner,
    etaMinutes: decision?.eta_minutes ?? null,
    items: (items ?? []).map((item) => ({
      name: item.catalog_products?.name ?? "Produto",
      quantity: item.quantity,
      unitPriceCents: item.unit_price_cents,
    })),
    subtotalCents: order.subtotal_cents,
    serviceFeeCents: order.service_fee_cents,
    deliveryFeeCents: order.delivery_fee_cents,
    totalCents: order.total_cents,
    createdAt: order.created_at,
    canCancel: CUSTOMER_CANCELLABLE_STATUSES.includes(order.status as OrderStatus),
  };
}

/**
 * Cancelamento pelo cliente — só liberado antes da distribuidora aceitar
 * (ver CUSTOMER_CANCELLABLE_STATUSES). Libera a reserva de estoque quando
 * havia uma. NÃO estorna pagamento online já capturado (cartão/Pix
 * aprovados) — isso ainda depende de reembolso manual via Mercado Pago,
 * não implementado; pedidos em dinheiro na entrega não têm esse problema
 * (nada foi cobrado ainda).
 */
export async function cancelOrder(db: SupabaseClient, orderId: string, customerId: string): Promise<void> {
  const { data: order, error } = await db
    .from("orders")
    .select("id, status")
    .eq("id", orderId)
    .eq("customer_id", customerId)
    .maybeSingle();

  if (error || !order) {
    throw new OrderNotFoundError("Pedido não encontrado.");
  }

  const status = order.status as OrderStatus;
  if (!CUSTOMER_CANCELLABLE_STATUSES.includes(status)) {
    throw new OrderNotCancellableError(
      "Este pedido já está em preparo e não pode mais ser cancelado por aqui — fale com a distribuidora ou com o suporte.",
    );
  }

  await transitionOrder(db, orderId, status, "CANCELLED", {
    reason: "customer_cancelled",
    actor: "customer",
  });

  if (status === "STOCK_RESERVED" || status === "AWAITING_PAYMENT" || status === "PARTNER_CONFIRMATION") {
    await db.rpc("release_order_stock", { p_order_id: orderId });
  }
}
