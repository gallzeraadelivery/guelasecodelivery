const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || "http://localhost:3333";

export class BackendError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function submitKyc(
  accessToken: string,
  input: { cpf: string; cnhNumber: string; cnhCategory: string },
): Promise<{ status: string }> {
  const response = await fetch(`${backendUrl}/drivers/kyc`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(input),
  });

  const body = await response.json();

  if (!response.ok) {
    throw new BackendError(body.error ?? "Falha ao enviar verificação.", response.status);
  }

  return body as { status: string };
}

async function respondToOffer(
  accessToken: string,
  offerId: string,
  action: "accept" | "reject",
): Promise<void> {
  const response = await fetch(`${backendUrl}/deliveries/offers/${offerId}/${action}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const body = await response.json();
    throw new BackendError(body.error ?? "Falha ao responder à oferta.", response.status);
  }
}

export const acceptOffer = (accessToken: string, offerId: string) =>
  respondToOffer(accessToken, offerId, "accept");

export const rejectOffer = (accessToken: string, offerId: string) =>
  respondToOffer(accessToken, offerId, "reject");

async function markDeliveryStep(
  accessToken: string,
  deliveryId: string,
  step: "arrived" | "picked-up" | "delivered",
): Promise<void> {
  const response = await fetch(`${backendUrl}/deliveries/${deliveryId}/${step}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const body = await response.json();
    throw new BackendError(body.error ?? "Falha ao atualizar a entrega.", response.status);
  }
}

export const markArrivedAtPickup = (accessToken: string, deliveryId: string) =>
  markDeliveryStep(accessToken, deliveryId, "arrived");

export const markPickedUp = (accessToken: string, deliveryId: string) =>
  markDeliveryStep(accessToken, deliveryId, "picked-up");

export const markDelivered = (accessToken: string, deliveryId: string) =>
  markDeliveryStep(accessToken, deliveryId, "delivered");

export type PixKeyType = "CPF" | "CNPJ" | "EMAIL" | "PHONE" | "RANDOM";

export async function requestWithdrawal(
  accessToken: string,
  input: { amountCents: number; pixKey: string; pixKeyType: PixKeyType; holderName: string },
): Promise<{ withdrawalId: string; status: string }> {
  const response = await fetch(`${backendUrl}/wallet/withdrawals`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(input),
  });

  const body = await response.json();

  if (!response.ok) {
    throw new BackendError(body.error ?? "Falha ao solicitar saque.", response.status);
  }

  return body as { withdrawalId: string; status: string };
}
