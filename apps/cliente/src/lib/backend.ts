const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || "http://localhost:3333";

export type CreateOrderResponse = {
  orderId: string;
  status: string;
  partner: { id: string; tradeName: string };
  etaMinutes: number;
  distanceKm: number;
  subtotalCents: number;
  serviceFeeCents: number;
  totalCents: number;
};

export class BackendError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function createOrder(
  accessToken: string,
  addressId: string,
  items: { catalogProductId: string; quantity: number }[],
): Promise<CreateOrderResponse> {
  const response = await fetch(`${backendUrl}/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ addressId, items }),
  });

  const body = await response.json();

  if (!response.ok) {
    throw new BackendError(body.error ?? "Falha ao criar pedido.", response.status);
  }

  return body as CreateOrderResponse;
}

export async function getPaymentKey(accessToken: string, orderId: string): Promise<{ publicKey: string }> {
  const response = await fetch(`${backendUrl}/orders/${orderId}/payment-key`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const body = await response.json();

  if (!response.ok) {
    throw new BackendError(body.error ?? "Falha ao preparar pagamento.", response.status);
  }

  return body as { publicKey: string };
}

export type PayOrderInput = {
  cardToken: string;
  paymentMethodId: string;
  installments: number;
  payerCpf: string;
};

export type PayOrderResponse = {
  status: "PENDING" | "APPROVED" | "REJECTED" | "REFUNDED" | "CANCELLED" | "IN_PROCESS";
  statusDetail: string | null;
};

export async function payOrder(
  accessToken: string,
  orderId: string,
  input: PayOrderInput,
): Promise<PayOrderResponse> {
  const response = await fetch(`${backendUrl}/orders/${orderId}/pay`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(input),
  });

  const body = await response.json();

  if (!response.ok) {
    throw new BackendError(body.error ?? "Não foi possível processar o pagamento.", response.status);
  }

  return body as PayOrderResponse;
}
