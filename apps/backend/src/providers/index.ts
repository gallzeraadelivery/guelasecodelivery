import type { Env } from "../env.js";
import { MercadoPagoPaymentProvider } from "./mercadopago-payment-provider.js";
import type { PaymentProvider } from "./payment-provider.js";

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

export type { PaymentProvider } from "./payment-provider.js";
