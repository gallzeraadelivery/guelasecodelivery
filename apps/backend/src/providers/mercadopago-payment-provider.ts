import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  CreateCheckoutInput,
  CreateCheckoutResult,
  NormalizedPaymentStatus,
  OAuthTokens,
  PaymentDetails,
  PaymentProvider,
  WebhookEvent,
  WebhookHeaders,
} from "./payment-provider.js";

/**
 * Implementação Mercado Pago do PaymentProvider — Split de Pagamentos 1:1
 * (seção 21): a preferência de checkout é criada com o access_token da
 * DISTRIBUIDORA (obtido via OAuth), com `marketplace_fee` retido para a
 * plataforma. O entregador não participa deste split.
 *
 * IMPORTANTE: escrito conforme a documentação pública do Mercado Pago (API
 * REST estável — /oauth/token, /checkout/preferences, /v1/payments, esquema
 * de assinatura x-signature), mas ainda NÃO testado contra credenciais reais
 * (nenhuma foi fornecida até este ponto do projeto). Antes de usar em
 * produção: validar contra o sandbox do Mercado Pago e ajustar o que a API
 * real exigir — é o esperado para qualquer integração de gateway.
 */
export class MercadoPagoPaymentProvider implements PaymentProvider {
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly redirectUri: string,
    private readonly webhookSecret: string,
  ) {}

  async getAppAccessToken(): Promise<string> {
    const response = await fetch("https://api.mercadopago.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: "client_credentials",
      }),
    });

    const body = await readJson<{ access_token: string }>(response);
    if (!response.ok) {
      throw new Error(`Falha ao obter token da aplicação no Mercado Pago: ${JSON.stringify(body)}`);
    }
    return body.access_token;
  }

  getOAuthConnectUrl(state: string): string {
    const url = new URL("https://auth.mercadopago.com.br/authorization");
    url.searchParams.set("client_id", this.clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("platform_id", "mp");
    url.searchParams.set("redirect_uri", this.redirectUri);
    url.searchParams.set("state", state);
    return url.toString();
  }

  async exchangeOAuthCode(code: string): Promise<OAuthTokens> {
    const response = await fetch("https://api.mercadopago.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: this.redirectUri,
      }),
    });

    const body = await readJson<{
      access_token: string;
      refresh_token?: string;
      public_key?: string;
      user_id: number | string;
      scope?: string;
      expires_in?: number;
    }>(response);
    if (!response.ok) {
      throw new Error(`Falha ao trocar código OAuth com o Mercado Pago: ${JSON.stringify(body)}`);
    }

    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? null,
      publicKey: body.public_key ?? null,
      externalUserId: String(body.user_id),
      scope: body.scope ?? null,
      expiresInSeconds: body.expires_in ?? null,
    };
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
    const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.sellerAccessToken}`,
      },
      body: JSON.stringify({
        items: input.items.map((item) => ({
          title: item.title,
          quantity: item.quantity,
          currency_id: "BRL",
          unit_price: item.unitPriceCents / 100,
        })),
        marketplace_fee: input.marketplaceFeeCents / 100,
        external_reference: input.orderId,
        notification_url: input.notificationUrl,
        payer: input.payerEmail ? { email: input.payerEmail } : undefined,
        back_urls: input.backUrls,
        auto_return: "approved",
      }),
    });

    const body = await readJson<{ id: string; init_point: string }>(response);
    if (!response.ok) {
      throw new Error(`Falha ao criar checkout no Mercado Pago: ${JSON.stringify(body)}`);
    }

    return {
      externalId: body.id,
      checkoutUrl: body.init_point,
      raw: body,
    };
  }

  async getPaymentDetails(paymentExternalId: string, accessToken: string): Promise<PaymentDetails> {
    const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentExternalId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const body = await readJson<{
      id: string | number;
      status: string;
      external_reference?: string;
      payment_method_id?: string;
      transaction_amount?: number;
      fee_details?: { type: string; amount: number }[];
      transaction_details?: { net_received_amount?: number };
    }>(response);
    if (!response.ok) {
      throw new Error(`Falha ao consultar pagamento no Mercado Pago: ${JSON.stringify(body)}`);
    }

    const feeDetails = body.fee_details ?? [];
    const marketplaceFee = feeDetails.find((fee) => fee.type === "marketplace_fee" || fee.type === "application_fee");
    const gatewayFee = feeDetails.find((fee) => fee.type === "mercadopago_fee");

    return {
      externalId: String(body.id),
      externalReference: body.external_reference ?? null,
      status: mapStatus(body.status),
      paymentMethod: body.payment_method_id ?? null,
      grossAmountCents: Math.round((body.transaction_amount ?? 0) * 100),
      gatewayFeeCents: gatewayFee ? Math.round(gatewayFee.amount * 100) : null,
      marketplaceFeeCents: marketplaceFee ? Math.round(marketplaceFee.amount * 100) : null,
      netAmountCents: body.transaction_details?.net_received_amount != null
        ? Math.round(body.transaction_details.net_received_amount * 100)
        : null,
      raw: body,
    };
  }

  verifyWebhookSignature(headers: WebhookHeaders, paymentExternalId: string): boolean {
    const signatureHeader = firstHeaderValue(headers["x-signature"]);
    const requestId = firstHeaderValue(headers["x-request-id"]);
    if (!signatureHeader || !requestId) return false;

    const parts = Object.fromEntries(
      signatureHeader.split(",").map((part) => {
        const [key, value] = part.split("=");
        return [key?.trim(), value?.trim()];
      }),
    );
    const ts = parts.ts;
    const receivedHash = parts.v1;
    if (!ts || !receivedHash) return false;

    const manifest = `id:${paymentExternalId.toLowerCase()};request-id:${requestId};ts:${ts};`;
    const expectedHash = createHmac("sha256", this.webhookSecret).update(manifest).digest("hex");

    const expected = Buffer.from(expectedHash, "utf8");
    const received = Buffer.from(receivedHash, "utf8");
    return expected.length === received.length && timingSafeEqual(expected, received);
  }

  extractWebhookEvent(body: unknown, _headers: WebhookHeaders): WebhookEvent | null {
    const payload = body as {
      id?: number | string;
      type?: string;
      action?: string;
      data?: { id?: string };
    } | null;

    if (!payload?.data?.id) return null;

    return {
      type: payload.type ?? payload.action ?? "unknown",
      paymentExternalId: payload.data.id,
      externalEventId: String(payload.id ?? payload.data.id),
    };
  }
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function mapStatus(mpStatus: string): NormalizedPaymentStatus {
  switch (mpStatus) {
    case "approved":
      return "APPROVED";
    case "rejected":
      return "REJECTED";
    case "refunded":
    case "charged_back":
      return "REFUNDED";
    case "cancelled":
      return "CANCELLED";
    case "in_process":
    case "in_mediation":
      return "IN_PROCESS";
    default:
      return "PENDING";
  }
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}
