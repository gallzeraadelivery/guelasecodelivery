import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tryOfferNextCandidate } from "../dispatch.service.js";

type Candidate = { driver_id: string; distance_km: number };

function thenable<T>(data: T) {
  return {
    then: (resolve: (v: { data: T; error: null }) => void) => resolve({ data, error: null }),
    maybeSingle: async () => ({ data, error: null }),
    single: async () => ({ data, error: null }),
  };
}

function fakeDb(config: {
  deliverySearchRadiusKm: number;
  partnerLocation: { lat: number; lng: number };
  addressLocation: { lat: number; lng: number };
  previousOfferDriverIds: string[];
  settings: Record<string, unknown>;
  candidatesByRadius: Record<number, Candidate[]>;
}) {
  const captured = {
    offers: [] as unknown[],
    events: [] as unknown[],
    radiusUpdates: [] as number[],
    findCandidatesCalls: [] as { p_radius_km: number; p_exclude_driver_ids: string[] }[],
  };

  const db = {
    from(table: string) {
      if (table === "deliveries") {
        return {
          select: () => ({
            eq: () =>
              thenable({
                id: "delivery-1",
                order_id: "order-1",
                status: "SEARCHING",
                search_radius_km: config.deliverySearchRadiusKm,
                pickup_partner_id: "partner-1",
                dropoff_address_id: "address-1",
              }),
          }),
          update: (payload: { search_radius_km?: number }) => {
            if (payload.search_radius_km !== undefined) captured.radiusUpdates.push(payload.search_radius_km);
            return { eq: async () => ({ data: null, error: null }) };
          },
        };
      }
      if (table === "delivery_offers") {
        return {
          select: () => ({
            eq: () => thenable(config.previousOfferDriverIds.map((driver_id) => ({ driver_id }))),
          }),
          insert: async (payload: unknown) => {
            captured.offers.push(payload);
            return { data: null, error: null };
          },
        };
      }
      if (table === "delivery_events") {
        return {
          insert: async (payload: unknown) => {
            captured.events.push(payload);
            return { data: null, error: null };
          },
        };
      }
      if (table === "platform_settings") {
        return {
          select: () => ({
            eq: (_col: string, key: string) => thenable({ value: config.settings[key] }),
          }),
        };
      }
      throw new Error(`tabela inesperada no teste: ${table}`);
    },
    rpc(name: string, params: Record<string, unknown>) {
      if (name === "get_partner_location") return thenable(config.partnerLocation);
      if (name === "get_address_location") return thenable(config.addressLocation);
      if (name === "find_driver_candidates") {
        captured.findCandidatesCalls.push(
          params as { p_radius_km: number; p_exclude_driver_ids: string[] },
        );
        const radius = params.p_radius_km as number;
        return Promise.resolve({ data: config.candidatesByRadius[radius] ?? [], error: null });
      }
      throw new Error(`rpc inesperada no teste: ${name}`);
    },
  } as unknown as SupabaseClient;

  return { db, captured };
}

const baseSettings = {
  dispatch_radius_tiers_km: [1, 2, 3, 5],
  logistics_avg_speed_kmh: 25,
  dispatch_offer_timeout_seconds: 30,
  driver_payout_rule: { min_cents: 500, per_km_cents: 150 },
};

describe("tryOfferNextCandidate", () => {
  it("oferta ao único candidato do raio inicial, sem expandir", async () => {
    const { db, captured } = fakeDb({
      deliverySearchRadiusKm: 1,
      partnerLocation: { lat: -15.6014, lng: -56.0966 },
      addressLocation: { lat: -15.6014, lng: -56.0966 },
      previousOfferDriverIds: [],
      settings: baseSettings,
      candidatesByRadius: { 1: [{ driver_id: "driver-near", distance_km: 0.5 }] },
    });

    await tryOfferNextCandidate(db, "delivery-1");

    expect(captured.radiusUpdates).toHaveLength(0);
    expect(captured.offers).toHaveLength(1);
    expect(captured.offers[0]).toMatchObject({ driver_id: "driver-near", search_radius_km: 1 });
  });

  it("expande para o próximo raio quando ninguém é encontrado no raio atual", async () => {
    const { db, captured } = fakeDb({
      deliverySearchRadiusKm: 1,
      partnerLocation: { lat: -15.6014, lng: -56.0966 },
      addressLocation: { lat: -15.6014, lng: -56.0966 },
      previousOfferDriverIds: [],
      settings: baseSettings,
      candidatesByRadius: {
        1: [],
        2: [],
        3: [{ driver_id: "driver-far", distance_km: 2.8 }],
      },
    });

    await tryOfferNextCandidate(db, "delivery-1");

    expect(captured.radiusUpdates).toEqual([3]);
    expect(captured.offers).toHaveLength(1);
    expect(captured.offers[0]).toMatchObject({ driver_id: "driver-far", search_radius_km: 3 });
  });

  it("não oferta nada quando todos os raios se esgotam sem candidato", async () => {
    const { db, captured } = fakeDb({
      deliverySearchRadiusKm: 1,
      partnerLocation: { lat: -15.6014, lng: -56.0966 },
      addressLocation: { lat: -15.6014, lng: -56.0966 },
      previousOfferDriverIds: [],
      settings: baseSettings,
      candidatesByRadius: { 1: [], 2: [], 3: [], 5: [] },
    });

    await tryOfferNextCandidate(db, "delivery-1");

    expect(captured.offers).toHaveLength(0);
  });

  it("passa ao RPC a lista de quem já foi ofertado, para nunca repetir na mesma entrega", async () => {
    const { db, captured } = fakeDb({
      deliverySearchRadiusKm: 5,
      partnerLocation: { lat: -15.6014, lng: -56.0966 },
      addressLocation: { lat: -15.6014, lng: -56.0966 },
      previousOfferDriverIds: ["driver-already-tried"],
      settings: baseSettings,
      // A exclusão de fato acontece dentro do RPC no Postgres real (já
      // validado na migration); aqui garantimos que o service repassa a
      // lista correta de quem já recebeu oferta nesta entrega.
      candidatesByRadius: { 5: [{ driver_id: "driver-new", distance_km: 4 }] },
    });

    await tryOfferNextCandidate(db, "delivery-1");

    expect(captured.findCandidatesCalls[0]?.p_exclude_driver_ids).toEqual(["driver-already-tried"]);
    expect(captured.offers[0]).toMatchObject({ driver_id: "driver-new" });
  });
});
