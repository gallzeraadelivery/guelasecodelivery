import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getSetting, driverPayoutRuleSchema } from "../../lib/settings.js";
import { estimateEtaMinutes } from "../fulfillment/eta.js";
import { haversineKm } from "./geo.js";
import { computeDriverPayoutCents } from "./payout.js";

type DeliveryRow = {
  id: string;
  order_id: string;
  status: string;
  search_radius_km: number;
  pickup_partner_id: string;
  dropoff_address_id: string;
};

async function getPartnerLocation(db: SupabaseClient, partnerId: string) {
  const { data } = await db.rpc("get_partner_location", { p_partner_id: partnerId }).maybeSingle<{
    lat: number;
    lng: number;
  }>();
  return data ?? null;
}

async function getAddressLocation(db: SupabaseClient, addressId: string) {
  const { data } = await db.rpc("get_address_location", { p_address_id: addressId }).maybeSingle<{
    lat: number;
    lng: number;
  }>();
  return data ?? null;
}

/** Cria a entrega (status SEARCHING) e tenta a primeira oferta imediatamente. */
export async function startDispatchForOrder(db: SupabaseClient, orderId: string): Promise<void> {
  const { data: order } = await db
    .from("orders")
    .select("id, partner_id, address_id")
    .eq("id", orderId)
    .single();

  if (!order?.partner_id) {
    throw new Error("Pedido sem distribuidora definida — não é possível iniciar o dispatch.");
  }

  const { data: delivery, error } = await db
    .from("deliveries")
    .insert({
      order_id: orderId,
      pickup_partner_id: order.partner_id,
      dropoff_address_id: order.address_id,
      status: "SEARCHING",
    })
    .select("id")
    .single();

  if (error || !delivery) {
    throw new Error(`Falha ao criar entrega: ${error?.message}`);
  }

  await tryOfferNextCandidate(db, delivery.id);
}

/**
 * Busca progressiva (seção 27): tenta o raio atual da entrega e, se ninguém
 * elegível for encontrado, expande para o próximo raio configurado — tudo
 * numa única passada. Entregadores já ofertados (aceitos, recusados ou
 * expirados) nunca são ofertados de novo para a mesma entrega.
 */
export async function tryOfferNextCandidate(db: SupabaseClient, deliveryId: string): Promise<void> {
  const { data: delivery } = await db
    .from("deliveries")
    .select("id, order_id, status, search_radius_km, pickup_partner_id, dropoff_address_id")
    .eq("id", deliveryId)
    .maybeSingle<DeliveryRow>();

  if (!delivery || delivery.status !== "SEARCHING") return;

  const partnerLocation = await getPartnerLocation(db, delivery.pickup_partner_id);
  const dropoffLocation = await getAddressLocation(db, delivery.dropoff_address_id);
  if (!partnerLocation || !dropoffLocation) return;

  const distanceToDropoffKm = haversineKm(
    partnerLocation.lat,
    partnerLocation.lng,
    dropoffLocation.lat,
    dropoffLocation.lng,
  );

  const { data: previousOffers } = await db
    .from("delivery_offers")
    .select("driver_id")
    .eq("delivery_id", deliveryId);
  const excludeDriverIds = [...new Set((previousOffers ?? []).map((o) => o.driver_id as string))];

  const radiusTiers = await getSetting(db, "dispatch_radius_tiers_km", z.array(z.number().positive()));

  let radius = delivery.search_radius_km;
  let candidate = await findCandidate(db, partnerLocation, radius, excludeDriverIds);

  while (!candidate) {
    const nextTier = radiusTiers.filter((tier) => tier > radius).sort((a, b) => a - b)[0];
    if (nextTier === undefined) return; // raios esgotados — próxima varredura do job tenta de novo
    radius = nextTier;
    candidate = await findCandidate(db, partnerLocation, radius, excludeDriverIds);
  }

  if (radius !== delivery.search_radius_km) {
    await db.from("deliveries").update({ search_radius_km: radius }).eq("id", deliveryId);
  }

  const [avgSpeedKmh, offerTimeoutSeconds, payoutRule] = await Promise.all([
    getSetting(db, "logistics_avg_speed_kmh", z.number().positive()),
    getSetting(db, "dispatch_offer_timeout_seconds", z.number().positive()),
    getSetting(db, "driver_payout_rule", driverPayoutRuleSchema),
  ]);

  const totalDistanceKm = candidate.distanceKm + distanceToDropoffKm;
  const etaMinutes = estimateEtaMinutes(totalDistanceKm, avgSpeedKmh, 0);
  const payoutCents = computeDriverPayoutCents(totalDistanceKm, payoutRule);

  await db.from("delivery_offers").insert({
    delivery_id: deliveryId,
    driver_id: candidate.driverId,
    distance_to_pickup_km: candidate.distanceKm,
    distance_to_dropoff_km: distanceToDropoffKm,
    total_distance_km: totalDistanceKm,
    eta_minutes: etaMinutes,
    payout_cents: payoutCents,
    payout_rule_snapshot: payoutRule,
    search_radius_km: radius,
    expires_at: new Date(Date.now() + offerTimeoutSeconds * 1000).toISOString(),
  });

  await db.from("delivery_events").insert({
    delivery_id: deliveryId,
    event_type: "OFFER_SENT",
    metadata: { driver_id: candidate.driverId, radius_km: radius },
  });
}

async function findCandidate(
  db: SupabaseClient,
  point: { lat: number; lng: number },
  radiusKm: number,
  excludeDriverIds: string[],
): Promise<{ driverId: string; distanceKm: number } | null> {
  const { data } = await db.rpc("find_driver_candidates", {
    p_lat: point.lat,
    p_lng: point.lng,
    p_radius_km: radiusKm,
    p_exclude_driver_ids: excludeDriverIds,
  });

  const rows = (data ?? []) as { driver_id: string; distance_km: number }[];
  const nearest = rows[0];
  return nearest ? { driverId: nearest.driver_id, distanceKm: nearest.distance_km } : null;
}

/** Varredura periódica (seção 27): expira ofertas vencidas e tenta a próxima
 * oferta para toda entrega que ficou sem oferta ativa. */
export async function runDispatchSweep(db: SupabaseClient): Promise<void> {
  await db
    .from("delivery_offers")
    .update({ status: "EXPIRED" })
    .eq("status", "OFFERED")
    .lt("expires_at", new Date().toISOString());

  const { data: pending } = await db.rpc("find_deliveries_needing_offer");
  for (const row of (pending ?? []) as { delivery_id: string }[]) {
    await tryOfferNextCandidate(db, row.delivery_id);
  }
}
