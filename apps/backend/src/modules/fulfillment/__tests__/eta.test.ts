import { describe, expect, it } from "vitest";
import { estimateEtaMinutes } from "../eta.js";

describe("estimateEtaMinutes", () => {
  it("soma tempo de deslocamento e tempo de preparo", () => {
    // 10km a 20km/h = 30min de deslocamento + 15min de preparo = 45min
    expect(estimateEtaMinutes(10, 20, 15)).toBe(45);
  });

  it("arredonda para uma casa decimal", () => {
    // 1km a 25km/h = 2.4min + 15min = 17.4min
    expect(estimateEtaMinutes(1, 25, 15)).toBeCloseTo(17.4, 1);
  });

  it("distância zero ainda soma o tempo de preparo", () => {
    expect(estimateEtaMinutes(0, 25, 15)).toBe(15);
  });
});
