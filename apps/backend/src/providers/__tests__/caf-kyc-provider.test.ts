import { describe, expect, it } from "vitest";
import { CafKycProvider } from "../caf-kyc-provider.js";

describe("CafKycProvider", () => {
  // Este provider ainda não tem a documentação real da API do CAF (ver
  // comentário no arquivo). Estes testes documentam o estado atual — falha
  // explícita e clara — para não deixar isso passar despercebido quando a
  // integração real for implementada.
  it("submitCheck falha de forma explícita até a API real ser integrada", async () => {
    const provider = new CafKycProvider("fake-api-key");
    await expect(
      provider.submitCheck({ driverId: "d1", cpf: "12345678900", cnhNumber: "123", cnhCategory: "AB" }),
    ).rejects.toThrow(/CAF/);
  });

  it("getCheckStatus falha de forma explícita até a API real ser integrada", async () => {
    const provider = new CafKycProvider("fake-api-key");
    await expect(provider.getCheckStatus("check-123")).rejects.toThrow(/CAF/);
  });
});
