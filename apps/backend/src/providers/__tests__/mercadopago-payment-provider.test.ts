import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MercadoPagoPaymentProvider } from "../mercadopago-payment-provider.js";

const WEBHOOK_SECRET = "test-webhook-secret";

function buildProvider() {
  return new MercadoPagoPaymentProvider(
    "client-id",
    "client-secret",
    "https://backend.example.com/partners/mercadopago/callback",
    WEBHOOK_SECRET,
  );
}

function signManifest(paymentId: string, requestId: string, ts: string, secret: string): string {
  const manifest = `id:${paymentId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  return createHmac("sha256", secret).update(manifest).digest("hex");
}

describe("MercadoPagoPaymentProvider.verifyWebhookSignature", () => {
  it("aceita uma assinatura válida", () => {
    const provider = buildProvider();
    const ts = "1700000000";
    const requestId = "req-1";
    const hash = signManifest("123456789", requestId, ts, WEBHOOK_SECRET);

    const valid = provider.verifyWebhookSignature(
      { "x-signature": `ts=${ts},v1=${hash}`, "x-request-id": requestId },
      "123456789",
    );

    expect(valid).toBe(true);
  });

  it("rejeita quando o hash não bate", () => {
    const provider = buildProvider();
    const valid = provider.verifyWebhookSignature(
      { "x-signature": "ts=1700000000,v1=hashinvalido", "x-request-id": "req-1" },
      "123456789",
    );
    expect(valid).toBe(false);
  });

  it("rejeita quando faltam os headers", () => {
    const provider = buildProvider();
    expect(provider.verifyWebhookSignature({}, "123456789")).toBe(false);
  });

  it("rejeita quando o payment id usado no cálculo é outro (payload adulterado)", () => {
    const provider = buildProvider();
    const ts = "1700000000";
    const requestId = "req-1";
    const hash = signManifest("123456789", requestId, ts, WEBHOOK_SECRET);

    const valid = provider.verifyWebhookSignature(
      { "x-signature": `ts=${ts},v1=${hash}`, "x-request-id": requestId },
      "999999999",
    );
    expect(valid).toBe(false);
  });
});

describe("MercadoPagoPaymentProvider.extractWebhookEvent", () => {
  it("extrai tipo, id do pagamento e id do evento de uma notificação válida", () => {
    const provider = buildProvider();
    const event = provider.extractWebhookEvent(
      { id: 999, type: "payment", data: { id: "123456789" } },
      {},
    );
    expect(event).toEqual({ type: "payment", paymentExternalId: "123456789", externalEventId: "999" });
  });

  it("retorna null quando não há data.id", () => {
    const provider = buildProvider();
    expect(provider.extractWebhookEvent({ type: "payment" }, {})).toBeNull();
    expect(provider.extractWebhookEvent(null, {})).toBeNull();
  });
});

describe("MercadoPagoPaymentProvider.getPaymentDetails", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("mapeia status aprovado e separa taxas de gateway/marketplace", async () => {
    const provider = buildProvider();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 555,
        status: "approved",
        external_reference: "order-abc",
        payment_method_id: "pix",
        transaction_amount: 100,
        fee_details: [
          { type: "mercadopago_fee", amount: 4 },
          { type: "marketplace_fee", amount: 2 },
        ],
        transaction_details: { net_received_amount: 94 },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const details = await provider.getPaymentDetails("555", "seller-token");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.mercadopago.com/v1/payments/555",
      expect.objectContaining({ headers: { Authorization: "Bearer seller-token" } }),
    );
    expect(details).toMatchObject({
      externalId: "555",
      externalReference: "order-abc",
      status: "APPROVED",
      paymentMethod: "pix",
      grossAmountCents: 10_000,
      gatewayFeeCents: 400,
      marketplaceFeeCents: 200,
      netAmountCents: 9_400,
    });
  });

  it("mapeia status rejeitado", async () => {
    const provider = buildProvider();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 1, status: "rejected", transaction_amount: 10 }),
      }),
    );

    const details = await provider.getPaymentDetails("1", "token");
    expect(details.status).toBe("REJECTED");
    expect(details.externalReference).toBeNull();
  });
});
