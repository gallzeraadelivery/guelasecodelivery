import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { KYCProvider, KycCheckResult, KycSubmissionInput } from "../../../providers/kyc-provider.js";
import { submitDriverKyc } from "../drivers.service.js";

function fakeProvider(result: KycCheckResult): KYCProvider {
  return {
    async submitCheck(_input: KycSubmissionInput) {
      return result;
    },
    async getCheckStatus(_id: string) {
      return result;
    },
  };
}

function fakeDb(insertError: { message: string } | null, captured: { payload?: unknown }): SupabaseClient {
  return {
    from(table: string) {
      return {
        async insert(payload: unknown) {
          if (table !== "kyc_checks") return { error: { message: "tabela inesperada" } };
          captured.payload = payload;
          return { error: insertError };
        },
      };
    },
  } as unknown as SupabaseClient;
}

const input: KycSubmissionInput = { driverId: "driver-1", cpf: "12345678900", cnhNumber: "999", cnhCategory: "AB" };

describe("submitDriverKyc", () => {
  it("registra o resultado do provider em kyc_checks com os campos corretos", async () => {
    const result: KycCheckResult = {
      externalCheckId: "check-abc",
      status: "APPROVED",
      checks: { cpf: true, cnh: true },
      raw: { ok: true },
    };
    const captured: { payload?: unknown } = {};

    const response = await submitDriverKyc(fakeDb(null, captured), fakeProvider(result), input);

    expect(response).toEqual({ status: "APPROVED" });
    expect(captured.payload).toMatchObject({
      driver_id: "driver-1",
      provider: "bitcoinp2p",
      external_check_id: "check-abc",
      status: "APPROVED",
      checks: { cpf: true, cnh: true },
    });
  });

  it("propaga falha ao gravar no banco", async () => {
    const result: KycCheckResult = { externalCheckId: "c1", status: "PENDING", checks: {}, raw: {} };
    const captured: { payload?: unknown } = {};

    await expect(
      submitDriverKyc(fakeDb({ message: "erro de banco" }, captured), fakeProvider(result), input),
    ).rejects.toThrow(/erro de banco/);
  });
});
