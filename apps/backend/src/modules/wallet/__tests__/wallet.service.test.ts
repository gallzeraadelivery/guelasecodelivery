import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requestWithdrawal, WithdrawalError } from "../wallet.service.js";

function fakeDb(
  settings: Record<string, unknown>,
  rpcResult: { data: unknown; error: { message: string } | null },
  captured: { rpcParams?: Record<string, unknown> },
): SupabaseClient {
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
    async rpc(name: string, params: Record<string, unknown>) {
      if (name !== "request_withdrawal") {
        return { data: null, error: { message: "rpc inesperada no teste" } };
      }
      captured.rpcParams = params;
      return rpcResult;
    },
  } as unknown as SupabaseClient;
}

const baseSettings = { withdrawal_rule: { min_cents: 2000, max_cents: 500000 } };
const baseInput = {
  driverId: "driver-1",
  amountCents: 5000,
  pixKey: "chave@example.com",
  pixKeyType: "EMAIL" as const,
  holderName: "Driver One",
};

describe("requestWithdrawal", () => {
  it("chama a RPC com a regra lida de platform_settings e retorna o id do saque", async () => {
    const captured: { rpcParams?: Record<string, unknown> } = {};
    const db = fakeDb(baseSettings, { data: "withdrawal-1", error: null }, captured);

    const result = await requestWithdrawal(db, baseInput);

    expect(result).toEqual({ withdrawalId: "withdrawal-1" });
    expect(captured.rpcParams).toMatchObject({
      p_driver_id: "driver-1",
      p_amount_cents: 5000,
      p_pix_key: "chave@example.com",
      p_pix_key_type: "EMAIL",
      p_holder_name: "Driver One",
      p_min_cents: 2000,
      p_max_cents: 500000,
    });
  });

  it("traduz WITHDRAWAL_BELOW_MINIMUM em um WithdrawalError com o código certo", async () => {
    const db = fakeDb(
      baseSettings,
      { data: null, error: { message: "WITHDRAWAL_BELOW_MINIMUM" } },
      {},
    );

    await expect(requestWithdrawal(db, baseInput)).rejects.toMatchObject({
      code: "WITHDRAWAL_BELOW_MINIMUM",
    });
  });

  it("traduz INSUFFICIENT_BALANCE em um WithdrawalError com o código certo", async () => {
    const db = fakeDb(baseSettings, { data: null, error: { message: "INSUFFICIENT_BALANCE" } }, {});

    await expect(requestWithdrawal(db, baseInput)).rejects.toBeInstanceOf(WithdrawalError);
  });

  it("propaga como erro genérico uma falha de RPC não reconhecida", async () => {
    const db = fakeDb(baseSettings, { data: null, error: { message: "erro inesperado de banco" } }, {});

    await expect(requestWithdrawal(db, baseInput)).rejects.toThrow(/erro inesperado de banco/);
  });
});
