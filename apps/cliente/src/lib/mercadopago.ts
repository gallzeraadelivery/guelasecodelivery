const MP_API = "https://api.mercadopago.com";

export type IdentifiedPaymentMethod = {
  paymentMethodId: string;
  issuerId: number | null;
};

/**
 * Identifica a bandeira do cartão pelos 6 primeiros dígitos (BIN) contra a
 * conta da distribuidora — o mesmo BIN pode valer bandeiras diferentes
 * dependendo do adquirente, então a busca já vem filtrada pelo Mercado Pago
 * (não é uma tabela de ranges fixa nossa).
 */
export async function identifyPaymentMethod(
  bin: string,
  publicKey: string,
): Promise<IdentifiedPaymentMethod | null> {
  const response = await fetch(
    `${MP_API}/v1/payment_methods/search?bin=${encodeURIComponent(bin)}&public_key=${encodeURIComponent(publicKey)}`,
  );
  const body = await response.json();
  if (!response.ok) return null;

  const results = (body.results ?? []) as {
    id: string;
    payment_type_id: string;
    issuer?: { id: number };
  }[];
  const match = results.find(
    (item) => item.payment_type_id === "credit_card" || item.payment_type_id === "debit_card",
  );

  if (!match) return null;
  return { paymentMethodId: match.id, issuerId: match.issuer?.id ?? null };
}

export type CardTokenInput = {
  cardNumber: string;
  expirationMonth: number;
  expirationYear: number;
  securityCode: string;
  cardholderName: string;
  payerCpf: string;
};

/**
 * Tokeniza o cartão direto com o Mercado Pago — os dados do cartão nunca
 * passam pelo nosso backend, só o token resultante.
 */
export async function createCardToken(publicKey: string, input: CardTokenInput): Promise<string> {
  const response = await fetch(`${MP_API}/v1/card_tokens?public_key=${encodeURIComponent(publicKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      card_number: input.cardNumber,
      expiration_month: input.expirationMonth,
      expiration_year: input.expirationYear,
      security_code: input.securityCode,
      cardholder: {
        name: input.cardholderName,
        identification: { type: "CPF", number: input.payerCpf },
      },
    }),
  });

  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.message ?? "Não foi possível validar o cartão.");
  }
  return body.id as string;
}
