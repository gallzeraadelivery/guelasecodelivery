import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listDisputedOrders, listKycFlags, listRepeatedPaymentFailures } from "../antifraude.service.js";

function thenable<T>(data: T) {
  return {
    then: (resolve: (v: { data: T; error: null }) => void) => resolve({ data, error: null }),
    single: async () => ({ data, error: null }),
  };
}

describe("listKycFlags", () => {
  it("lista entregadores com KYC rejeitado ou em revisão, com o nome do profile", async () => {
    const db = {
      from: (table: string) => {
        if (table === "drivers") {
          return { select: () => ({ in: () => thenable([{ id: "d1", kyc_status: "REJECTED" }]) }) };
        }
        if (table === "profiles") {
          return { select: () => ({ in: () => thenable([{ id: "d1", full_name: "Driver One" }]) }) };
        }
        throw new Error("tabela inesperada");
      },
    } as unknown as SupabaseClient;

    expect(await listKycFlags(db)).toEqual([{ driverId: "d1", driverName: "Driver One", kycStatus: "REJECTED" }]);
  });

  it("retorna lista vazia sem consultar profiles quando não há flags", async () => {
    const db = {
      from: (table: string) => {
        if (table === "drivers") return { select: () => ({ in: () => thenable([]) }) };
        throw new Error("não deveria consultar profiles sem drivers flagados");
      },
    } as unknown as SupabaseClient;

    expect(await listKycFlags(db)).toEqual([]);
  });
});

describe("listDisputedOrders", () => {
  it("junta o nome do cliente e da distribuidora", async () => {
    const orderRow = {
      id: "o1",
      total_cents: 5000,
      created_at: "now",
      customer_id: "c1",
      partners: { trade_name: "Distribuidora X" },
    };
    const db = {
      from: (table: string) => {
        if (table === "orders") {
          return {
            select: () => ({ eq: () => ({ order: () => ({ limit: () => thenable([orderRow]) }) }) }),
          };
        }
        if (table === "profiles") {
          return { select: () => ({ in: () => thenable([{ id: "c1", full_name: "Cliente Um" }]) }) };
        }
        throw new Error("tabela inesperada");
      },
    } as unknown as SupabaseClient;

    expect(await listDisputedOrders(db)).toEqual([
      { orderId: "o1", customerName: "Cliente Um", partnerName: "Distribuidora X", totalCents: 5000, createdAt: "now" },
    ]);
  });
});

describe("listRepeatedPaymentFailures", () => {
  function fakeDb(threshold: number, payments: { orders: { customer_id: string } | null }[], profiles: { id: string; full_name: string | null }[]) {
    return {
      from: (table: string) => {
        if (table === "platform_settings") {
          return { select: () => ({ eq: () => ({ single: async () => ({ data: { value: threshold }, error: null }) }) }) };
        }
        if (table === "payments") {
          return { select: () => ({ eq: () => thenable(payments) }) };
        }
        if (table === "profiles") {
          return { select: () => ({ in: () => thenable(profiles) }) };
        }
        throw new Error("tabela inesperada");
      },
    } as unknown as SupabaseClient;
  }

  it("flagueia clientes com falhas de pagamento no limite ou acima", async () => {
    const payments = [
      { orders: { customer_id: "c1" } },
      { orders: { customer_id: "c1" } },
      { orders: { customer_id: "c1" } },
      { orders: { customer_id: "c2" } },
    ];
    const db = fakeDb(3, payments, [{ id: "c1", full_name: "Cliente Um" }]);

    expect(await listRepeatedPaymentFailures(db)).toEqual([{ customerId: "c1", customerName: "Cliente Um", failureCount: 3 }]);
  });

  it("não flagueia ninguém abaixo do limite", async () => {
    const payments = [{ orders: { customer_id: "c1" } }, { orders: { customer_id: "c1" } }];
    const db = fakeDb(3, payments, []);

    expect(await listRepeatedPaymentFailures(db)).toEqual([]);
  });
});
