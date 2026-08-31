export type CartItemInput = {
  catalogProductId: string;
  quantity: number;
};

export type PartnerCandidateRow = {
  partner_id: string;
  trade_name: string;
  is_online: boolean;
  is_open_now: boolean;
  has_full_stock: boolean;
  missing_catalog_product_id: string | null;
  distance_km: number;
  partner_lat: number;
  partner_lng: number;
};

export type EvaluatedCandidate = {
  partnerId: string;
  tradeName: string;
  eligible: boolean;
  eliminationReason: string | null;
  distanceKm: number;
  etaMinutes: number | null;
  score: number | null;
};

export type FulfillmentSelectionResult = {
  algorithmVersion: string;
  winner: EvaluatedCandidate | null;
  candidates: EvaluatedCandidate[];
};
