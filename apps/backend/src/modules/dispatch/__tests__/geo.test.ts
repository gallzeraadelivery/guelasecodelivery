import { describe, expect, it } from "vitest";
import { haversineKm } from "../geo.js";

describe("haversineKm", () => {
  it("distância entre o mesmo ponto é zero", () => {
    expect(haversineKm(-15.6014, -56.0966, -15.6014, -56.0966)).toBe(0);
  });

  it("é simétrica", () => {
    const a = haversineKm(-15.6014, -56.0966, -15.65, -56.15);
    const b = haversineKm(-15.65, -56.15, -15.6014, -56.0966);
    expect(a).toBe(b);
  });

  it("calcula uma distância plausível para dois pontos em Cuiabá (poucos km)", () => {
    const km = haversineKm(-15.6014, -56.0966, -15.62, -56.1);
    expect(km).toBeGreaterThan(0);
    expect(km).toBeLessThan(10);
  });
});
