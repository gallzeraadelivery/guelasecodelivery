import type { Env } from "../env.js";
import { BitcoinP2PKycProvider } from "./bitcoinp2p-kyc-provider.js";
import type { KYCProvider } from "./kyc-provider.js";
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
  if (!env.BITCOINP2P_API_KEY) {
    throw new Error("KYC não configurado. Defina BITCOINP2P_API_KEY para habilitar verificação de entregadores.");
  }
  return new BitcoinP2PKycProvider(env.BITCOINP2P_API_KEY);
}

export function getPayoutProvider(_env: Env): PayoutProvider {
  // Nenhum provedor real de PIX foi decidido ainda — ver unconfigured-payout-provider.ts.
  return new UnconfiguredPayoutProvider();
}

export type { PaymentProvider } from "./payment-provider.js";
export type { KYCProvider } from "./kyc-provider.js";
export type { PayoutProvider } from "./payout-provider.js";
