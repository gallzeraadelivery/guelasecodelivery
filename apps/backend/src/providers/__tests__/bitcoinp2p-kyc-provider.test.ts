import { describe, expect, it } from "vitest";
import { BitcoinP2PKycProvider } from "../bitcoinp2p-kyc-provider.js";

describe("BitcoinP2PKycProvider", () => {
  // Este provider ainda não tem a documentação real da API do BitcoinP2P
  // (ver comentário no arquivo). Estes testes documentam o estado atual —
  // falha explícita e clara — para não deixar isso passar despercebido
  // quando a integração real for implementada.
  it("submitCheck falha de forma explícita até a API real ser integrada", async () => {
    const provider = new BitcoinP2PKycProvider("fake-api-key");
    await expect(
      provider.submitCheck({ driverId: "d1", cpf: "12345678900", cnhNumber: "123", cnhCategory: "AB" }),
    ).rejects.toThrow(/BitcoinP2P/);
  });

  it("getCheckStatus falha de forma explícita até a API real ser integrada", async () => {
    const provider = new BitcoinP2PKycProvider("fake-api-key");
    await expect(provider.getCheckStatus("check-123")).rejects.toThrow(/BitcoinP2P/);
  });
});
