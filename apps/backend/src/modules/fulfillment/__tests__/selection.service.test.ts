import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { selectFulfillmentPartner } from "../selection.service.js";
import type { PartnerCandidateRow } from "../types.js";

function fakeDb(settings: Record<string, unknown>, candidateRows: PartnerCandidateRow[]): SupabaseClient {
  return {
    from(table: string) {
      let key: string | undefined;
      return {
        select() {
          return this;
        },
        eq(_col: string, value: string) {
          key = value;
          return this;
        },
        async single() {
          if (table !== "platform_settings") {
            return { data: null, error: { message: "tabela inesperada no teste" } };
          }
          const value = settings[key as string];
          if (value === undefined) return { data: null, error: { message: "not found" } };
          return { data: { value }, error: null };
        },
      };
    },
    async rpc(name: string) {
      if (name !== "find_partner_candidates") {
        return { data: null, error: { message: "rpc inesperada no teste" } };
      }
      return { data: candidateRows, error: null };
    },
  } as unknown as SupabaseClient;
}

// Reproduz o cenário do documento de arquitetura: cliente quer Heineken + Coca +
// Carvão. B não tem carvão, C está fechado agora, D está offline — só A é
// elegível. Mesmos dados já validados manualmente em Postgres na Fase 4.
const scenarioRows: PartnerCandidateRow[] = [
  {
    partner_id: "a",
    trade_name: "Distribuidora A",
    is_online: true,
    is_open_now: true,
    has_full_stock: true,
    missing_catalog_product_id: null,
    distance_km: 0.06,
    partner_lat: -15.601,
    partner_lng: -56.097,
  },
  {
    partner_id: "b",
    trade_name: "Distribuidora B",
    is_online: true,
    is_open_now: true,
    has_full_stock: false,
    missing_catalog_product_id: "carvao-id",
    distance_km: 0.16,
    partner_lat: -15.602,
    partner_lng: -56.098,
  },
  {
    partner_id: "c",
    trade_name: "Distribuidora C",
    is_online: true,
    is_open_now: false,
    has_full_stock: true,
    missing_catalog_product_id: null,
    distance_km: 0.02,
    partner_lat: -15.6015,
    partner_lng: -56.0965,
  },
  {
    partner_id: "d",
    trade_name: "Distribuidora D",
    is_online: false,
    is_open_now: true,
    has_full_stock: true,
    missing_catalog_product_id: null,
    distance_km: 0.03,
    partner_lat: -15.6012,
    partner_lng: -56.0968,
  },
];

const settings = { logistics_avg_speed_kmh: 25, default_preparation_minutes: 15 };
const items = [{ catalogProductId: "heineken-id", quantity: 2 }];

describe("selectFulfillmentPartner", () => {
  it("elimina por horário, estoque incompleto e status offline, e escolhe a única elegível", async () => {
    const result = await selectFulfillmentPartner(fakeDb(settings, scenarioRows), {
      lat: -15.6014,
      lng: -56.0966,
      items,
    });

    expect(result.winner?.partnerId).toBe("a");
    expect(result.candidates).toHaveLength(4);

    const byId = Object.fromEntries(result.candidates.map((c) => [c.partnerId, c]));
    expect(byId.b.eligible).toBe(false);
    expect(byId.b.eliminationReason).toBe("missing_product:carvao-id");
    expect(byId.c.eligible).toBe(false);
    expect(byId.c.eliminationReason).toBe("partner_closed");
    expect(byId.d.eligible).toBe(false);
    expect(byId.d.eliminationReason).toBe("partner_offline");
  });

  it("calcula o ETA do vencedor a partir da distância e das configurações", async () => {
    const result = await selectFulfillmentPartner(fakeDb(settings, scenarioRows), {
      lat: -15.6014,
      lng: -56.0966,
      items,
    });

    // 0.06km / 25km/h * 60 + 15min de preparo = 15.144 -> arredondado 15.1
    expect(result.winner?.etaMinutes).toBeCloseTo(15.1, 1);
  });

  it("não escolhe ninguém quando todos os candidatos são inelegíveis", async () => {
    const allEliminated = scenarioRows.map((row) => ({ ...row, has_full_stock: false }));
    const result = await selectFulfillmentPartner(fakeDb(settings, allEliminated), {
      lat: -15.6014,
      lng: -56.0966,
      items,
    });

    expect(result.winner).toBeNull();
  });

  it("entre dois elegíveis, escolhe o de menor ETA (mais perto), não o primeiro da lista", async () => {
    const rows: PartnerCandidateRow[] = [
      { ...scenarioRows[0]!, partner_id: "far", distance_km: 5 },
      { ...scenarioRows[0]!, partner_id: "near", distance_km: 0.1 },
    ];

    const result = await selectFulfillmentPartner(fakeDb(settings, rows), {
      lat: -15.6014,
      lng: -56.0966,
      items,
    });

    expect(result.winner?.partnerId).toBe("near");
  });
});
