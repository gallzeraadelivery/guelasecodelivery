import type { Env } from "../env.js";
import type { KYCProvider } from "./kyc-provider.js";
import { SumsubKycProvider } from "./sumsub-kyc-provider.js";
import { MercadoPagoPaymentProvider } from "./mercadopago-payment-provider.js";
import type { PaymentProvider } from "./payment-provider.js";
import type { PayoutProvider } from "./payout-provider.js";
import { UnconfiguredPayoutProvider } from "./unconfigured-payout-provider.js";

export function getPaymentProvider(env: Env): PaymentProvider {
  if (
    !env.MERCADOPAGO_CLIENT_ID ||
    !env.MERCADOPAGO_CLIENT_SECRET ||
    !env.MERCADOPAGO_WEBHOOK_SECRET ||
    !env.BACKEND_PUBLIC_URL
  ) {
    throw new Error(
      "Mercado Pago não configurado. Defina MERCADOPAGO_CLIENT_ID, MERCADOPAGO_CLIENT_SECRET, " +
        "MERCADOPAGO_WEBHOOK_SECRET e BACKEND_PUBLIC_URL para habilitar pagamentos.",
    );
  }

  const redirectUri = `${env.BACKEND_PUBLIC_URL}/partners/mercadopago/callback`;

  return new MercadoPagoPaymentProvider(
    env.MERCADOPAGO_CLIENT_ID,
    env.MERCADOPAGO_CLIENT_SECRET,
    redirectUri,
    env.MERCADOPAGO_WEBHOOK_SECRET,
  );
}

export function getKycProvider(env: Env): KYCProvider {
  if (!env.SUMSUB_APP_TOKEN || !env.SUMSUB_SECRET_KEY || !env.SUMSUB_LEVEL_NAME) {
    throw new Error(
      "KYC não configurado. Defina SUMSUB_APP_TOKEN, SUMSUB_SECRET_KEY e SUMSUB_LEVEL_NAME " +
        "(nome do nível de verificação criado no Dashboard do Sumsub, em Verification levels) " +
        "para habilitar verificação de entregadores.",
    );
  }
  return new SumsubKycProvider({
    appToken: env.SUMSUB_APP_TOKEN,
    secretKey: env.SUMSUB_SECRET_KEY,
    levelName: env.SUMSUB_LEVEL_NAME,
  });
}

export function getPayoutProvider(_env: Env): PayoutProvider {
  // Nenhum provedor real de PIX foi decidido ainda — ver unconfigured-payout-provider.ts.
  return new UnconfiguredPayoutProvider();
}

export type { PaymentProvider } from "./payment-provider.js";
export type { KYCProvider } from "./kyc-provider.js";
export type { PayoutProvider } from "./payout-provider.js";
