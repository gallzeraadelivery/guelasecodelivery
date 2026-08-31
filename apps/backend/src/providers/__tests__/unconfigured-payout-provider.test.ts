import { describe, expect, it } from "vitest";
import { UnconfiguredPayoutProvider } from "../unconfigured-payout-provider.js";

describe("UnconfiguredPayoutProvider", () => {
  // Nenhum provedor real de PIX foi decidido/configurado ainda (ver
  // comentário no arquivo). Este teste documenta o estado atual — falha
  // explícita e clara — para não passar despercebido quando a integração
  // real for implementada.
  it("sendPixPayout falha de forma explícita até um provedor real ser configurado", async () => {
    const provider = new UnconfiguredPayoutProvider();
    await expect(
      provider.sendPixPayout({
        withdrawalId: "w1",
        amountCents: 1000,
        pixKey: "chave@example.com",
        pixKeyType: "EMAIL",
        holderName: "Driver One",
      }),
    ).rejects.toThrow(/provedor de saque PIX configurado/);
  });
});
