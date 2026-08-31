import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getSetting, serviceFeeRuleSchema } from "../../lib/settings.js";
import { selectFulfillmentPartner } from "../fulfillment/selection.service.js";
import type { CartItemInput } from "../fulfillment/types.js";
import { computeServiceFeeCents } from "./pricing.js";
import { transitionOrder } from "./orders.repository.js";
import {
  AddressWithoutLocationError,
  EmptyCartError,
  NoEligiblePartnerError,
  StockConflictError,
} from "./orders.errors.js";

export type CreateOrderInput = {
  customerId: string;
  addressId: string;
  items: CartItemInput[];
};

export type CreateOrderResult = {
  orderId: string;
  status: "AWAITING_PAYMENT";
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
    .insert({ customer_id: input.customerId, address_id: input.addressId, status: "CREATED" })
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
    throw new NoEligiblePartnerError(
      "Nenhuma distribuidora consegue atender 100% do seu carrinho nesta região agora.",
    );
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
