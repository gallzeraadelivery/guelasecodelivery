import { describe, expect, it } from "vitest";
import { signPartnerState, verifyPartnerState } from "../oauth-state.js";

describe("oauth-state", () => {
  it("assina e verifica corretamente o mesmo partnerId", () => {
    const state = signPartnerState("partner-123", "segredo");
    expect(verifyPartnerState(state, "segredo")).toBe("partner-123");
  });

  it("rejeita state adulterado (partnerId trocado mantendo a assinatura)", () => {
    const state = signPartnerState("partner-123", "segredo");
    const [, signature] = state.split(".");
    const tampered = `partner-456.${signature}`;
    expect(verifyPartnerState(tampered, "segredo")).toBeNull();
  });

  it("rejeita quando o segredo usado na verificação é diferente", () => {
    const state = signPartnerState("partner-123", "segredo-a");
    expect(verifyPartnerState(state, "segredo-b")).toBeNull();
  });

  it("rejeita state malformado", () => {
    expect(verifyPartnerState("sem-ponto", "segredo")).toBeNull();
    expect(verifyPartnerState("", "segredo")).toBeNull();
  });
});
