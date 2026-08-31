import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getSetting } from "../../lib/settings.js";
import { estimateEtaMinutes } from "./eta.js";
import type {
  CartItemInput,
  EvaluatedCandidate,
  FulfillmentSelectionResult,
  PartnerCandidateRow,
} from "./types.js";

/**
 * Versão do algoritmo de seleção — salva em cada pedido para auditoria
 * (seção 19). Trocar a fórmula no futuro exige incrementar esta constante,
 * nunca reescrever o histórico de pedidos já decididos.
 */
export const ALGORITHM_VERSION = "v1-best-eta";

function eliminationReasonFor(row: PartnerCandidateRow): string | null {
  if (!row.is_online) return "partner_offline";
  if (!row.is_open_now) return "partner_closed";
  if (!row.has_full_stock) return `missing_product:${row.missing_catalog_product_id}`;
  return null;
}

/**
 * Encontra, entre as distribuidoras cuja área de atendimento cobre o
 * endereço do cliente, a que consegue fornecer 100% do carrinho com o menor
 * ETA estimado (regra de ouro do fulfillment — seção 63). Nunca divide o
 * pedido entre distribuidoras no MVP.
 */
export async function selectFulfillmentPartner(
  db: SupabaseClient,
  params: { lat: number; lng: number; items: CartItemInput[] },
): Promise<FulfillmentSelectionResult> {
  const [avgSpeedKmh, preparationMinutes] = await Promise.all([
    getSetting(db, "logistics_avg_speed_kmh", z.number().positive()),
    getSetting(db, "default_preparation_minutes", z.number().nonnegative()),
  ]);

  const { data, error } = await db.rpc("find_partner_candidates", {
    p_lat: params.lat,
    p_lng: params.lng,
    p_items: params.items.map((item) => ({
      catalog_product_id: item.catalogProductId,
      quantity: item.quantity,
    })),
  });

  if (error) {
    throw new Error(`Falha ao buscar distribuidoras candidatas: ${error.message}`);
  }

  const rows = (data ?? []) as PartnerCandidateRow[];

  const candidates: EvaluatedCandidate[] = rows.map((row) => {
    const eliminationReason = eliminationReasonFor(row);
    const eligible = eliminationReason === null;
    const etaMinutes = eligible
      ? estimateEtaMinutes(row.distance_km, avgSpeedKmh, preparationMinutes)
      : null;

    return {
      partnerId: row.partner_id,
      tradeName: row.trade_name,
      eligible,
      eliminationReason,
      distanceKm: row.distance_km,
      etaMinutes,
      // Regra inicial (seção 2): menor ETA vence. Score = ETA para manter a
      // arquitetura pronta para uma fórmula mais rica no futuro sem mudar o
      // contrato desta função.
      score: etaMinutes,
    };
  });

  const winner = candidates
    .filter((c) => c.eligible && c.etaMinutes !== null)
    .sort((a, b) => (a.etaMinutes as number) - (b.etaMinutes as number))[0];

  return {
    algorithmVersion: ALGORITHM_VERSION,
    winner: winner ?? null,
    candidates,
  };
}
