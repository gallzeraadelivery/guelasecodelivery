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

export type OrderPaymentMethod = "ONLINE" | "CASH_ON_DELIVERY";

export async function createOrder(
  accessToken: string,
  addressId: string,
  items: { catalogProductId: string; quantity: number }[],
  paymentMethod: OrderPaymentMethod,
): Promise<CreateOrderResponse> {
  const response = await fetch(`${backendUrl}/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ addressId, items, paymentMethod }),
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

export type PayOrderPixInput = {
  payerName: string;
  payerCpf: string;
};

export type PayOrderPixResponse = {
  status: "PENDING" | "APPROVED" | "REJECTED" | "REFUNDED" | "CANCELLED" | "IN_PROCESS";
  qrCode: string;
  qrCodeBase64: string;
  ticketUrl: string | null;
};

export async function payOrderPix(
  accessToken: string,
  orderId: string,
  input: PayOrderPixInput,
): Promise<PayOrderPixResponse> {
  const response = await fetch(`${backendUrl}/orders/${orderId}/pay/pix`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(input),
  });

  const body = await response.json();

  if (!response.ok) {
    throw new BackendError(body.error ?? "Não foi possível gerar o Pix.", response.status);
  }

  return body as PayOrderPixResponse;
}

export type OrderDetails = {
  orderId: string;
  status: string;
  paymentMethod: OrderPaymentMethod;
  partner: { tradeName: string; phone: string | null; addressLine: string | null } | null;
  etaMinutes: number | null;
  items: { name: string; quantity: number; unitPriceCents: number | null }[];
  subtotalCents: number | null;
  serviceFeeCents: number | null;
  deliveryFeeCents: number | null;
  totalCents: number | null;
  createdAt: string;
  canCancel: boolean;
  cancellationReason: string | null;
};

export async function getOrderDetails(accessToken: string, orderId: string): Promise<OrderDetails> {
  const response = await fetch(`${backendUrl}/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const body = await response.json();

  if (!response.ok) {
    throw new BackendError(body.error ?? "Falha ao buscar pedido.", response.status);
  }

  return body as OrderDetails;
}

export type OrderTracking = {
  deliveryStatus: string | null;
  driver: { lat: number; lng: number } | null;
  dropoff: { lat: number; lng: number } | null;
};

export async function getOrderTracking(accessToken: string, orderId: string): Promise<OrderTracking> {
  const response = await fetch(`${backendUrl}/orders/${orderId}/tracking`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const body = await response.json();

  if (!response.ok) {
    throw new BackendError(body.error ?? "Falha ao buscar localização do pedido.", response.status);
  }

  return body as OrderTracking;
}

export async function cancelOrder(accessToken: string, orderId: string): Promise<void> {
  const response = await fetch(`${backendUrl}/orders/${orderId}/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const body = await response.json();
    throw new BackendError(body.error ?? "Não foi possível cancelar o pedido.", response.status);
  }
}
