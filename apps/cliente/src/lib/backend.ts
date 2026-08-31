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

export async function createCheckout(accessToken: string, orderId: string): Promise<{ checkoutUrl: string }> {
  const response = await fetch(`${backendUrl}/orders/${orderId}/checkout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const body = await response.json();

  if (!response.ok) {
    throw new BackendError(body.error ?? "Falha ao iniciar pagamento.", response.status);
  }

  return body as { checkoutUrl: string };
}
