/**
 * Abstração de gateway de pagamento (seção 11 da arquitetura). Nenhuma regra
 * de negócio deve depender diretamente do Mercado Pago — só desta interface.
 * Trocar de fornecedor no futuro significa escrever uma nova implementação,
 * não reescrever checkout/webhooks.
 */

export type NormalizedPaymentStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "REFUNDED"
  | "CANCELLED"
  | "IN_PROCESS";

export type CreateCheckoutInput = {
  orderId: string;
  sellerAccessToken: string;
  items: { title: string; quantity: number; unitPriceCents: number }[];
  marketplaceFeeCents: number;
  payerEmail?: string;
  notificationUrl: string;
  backUrls: { success: string; failure: string; pending: string };
};

export type CreateCheckoutResult = {
  externalId: string;
  checkoutUrl: string;
  raw: unknown;
};

export type PaymentDetails = {
  externalId: string;
  externalReference: string | null;
  status: NormalizedPaymentStatus;
  paymentMethod: string | null;
  grossAmountCents: number;
  gatewayFeeCents: number | null;
  marketplaceFeeCents: number | null;
  netAmountCents: number | null;
  raw: unknown;
};

export type OAuthTokens = {
  accessToken: string;
  refreshToken: string | null;
  publicKey: string | null;
  externalUserId: string;
  scope: string | null;
  expiresInSeconds: number | null;
};

export type WebhookEvent = {
  type: string;
  paymentExternalId: string | null;
  externalEventId: string;
};

export interface PaymentProvider {
  getOAuthConnectUrl(state: string): string;
  exchangeOAuthCode(code: string): Promise<OAuthTokens>;
  createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult>;
  getPaymentDetails(paymentExternalId: string, accessToken: string): Promise<PaymentDetails>;
  /**
   * Token da própria aplicação (client_credentials, sem contexto de um
   * seller específico) — usado pelo webhook para consultar o pagamento
   * antes de sabermos a qual pedido/distribuidora ele pertence
   * (external_reference só é conhecido depois dessa consulta).
   */
  getAppAccessToken(): Promise<string>;
  verifyWebhookSignature(headers: WebhookHeaders, paymentExternalId: string): boolean;
  extractWebhookEvent(body: unknown, headers: WebhookHeaders): WebhookEvent | null;
}

export type WebhookHeaders = Record<string, string | string[] | undefined>;
