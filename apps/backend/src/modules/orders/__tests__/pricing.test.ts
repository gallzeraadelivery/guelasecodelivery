import { describe, expect, it } from "vitest";
import { computeServiceFeeCents } from "../pricing.js";

describe("computeServiceFeeCents", () => {
  it("taxa fixa ignora o subtotal", () => {
    expect(computeServiceFeeCents(10_000, { type: "fixed", amount_cents: 199 })).toBe(199);
  });

  it("taxa percentual usa basis points (1/100 de %)", () => {
    // 500 bps = 5% de 10000 centavos = 500 centavos
    expect(computeServiceFeeCents(10_000, { type: "percentage", percentage_bps: 500 })).toBe(500);
  });

  it("aplica o mínimo configurado", () => {
    expect(
      computeServiceFeeCents(100, { type: "percentage", percentage_bps: 500, min_cents: 199 }),
    ).toBe(199);
  });

  it("aplica o máximo configurado", () => {
    expect(
      computeServiceFeeCents(100_000, { type: "percentage", percentage_bps: 500, max_cents: 990 }),
    ).toBe(990);
  });

  it("taxa fixa sem amount_cents definido é zero, não undefined", () => {
    expect(computeServiceFeeCents(10_000, { type: "fixed" })).toBe(0);
  });
});
