import { describe, expect, it } from "vitest";
import { assertValidTransition } from "../order-state-machine.js";

describe("assertValidTransition", () => {
  it("permite o caminho feliz do fulfillment (Fase 4)", () => {
    expect(() => assertValidTransition("CREATED", "FULFILLMENT_SELECTED")).not.toThrow();
    expect(() => assertValidTransition("FULFILLMENT_SELECTED", "STOCK_RESERVED")).not.toThrow();
    expect(() => assertValidTransition("STOCK_RESERVED", "AWAITING_PAYMENT")).not.toThrow();
  });

  it("permite cancelamento e expiração nos pontos previstos", () => {
    expect(() => assertValidTransition("CREATED", "CANCELLED")).not.toThrow();
    expect(() => assertValidTransition("AWAITING_PAYMENT", "EXPIRED")).not.toThrow();
  });

  it("rejeita pular etapas do fulfillment", () => {
    expect(() => assertValidTransition("CREATED", "STOCK_RESERVED")).toThrow(/inválida/);
    expect(() => assertValidTransition("CREATED", "AWAITING_PAYMENT")).toThrow();
  });

  it("rejeita transição a partir de um estado terminal", () => {
    expect(() => assertValidTransition("CANCELLED", "CREATED")).toThrow();
    expect(() => assertValidTransition("EXPIRED", "AWAITING_PAYMENT")).toThrow();
  });

  it("rejeita voltar um pedido pago para antes do pagamento", () => {
    expect(() => assertValidTransition("PAID", "AWAITING_PAYMENT")).toThrow();
  });
});
