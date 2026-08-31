import { describe, expect, it } from "vitest";
import { computeDriverPayoutCents } from "../payout.js";

describe("computeDriverPayoutCents", () => {
  it("usa o valor por km quando ele supera o mínimo", () => {
    expect(computeDriverPayoutCents(10, { min_cents: 500, per_km_cents: 150 })).toBe(1500);
  });

  it("aplica o mínimo quando a distância é curta", () => {
    expect(computeDriverPayoutCents(1, { min_cents: 500, per_km_cents: 150 })).toBe(500);
  });

  it("arredonda o valor calculado por distância", () => {
    expect(computeDriverPayoutCents(3.333, { min_cents: 0, per_km_cents: 100 })).toBe(333);
  });
});
