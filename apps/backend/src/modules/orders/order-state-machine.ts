export type OrderStatus =
  | "CREATED"
  | "FULFILLMENT_SELECTED"
  | "STOCK_RESERVED"
  | "AWAITING_PAYMENT"
  | "PAID"
  | "PARTNER_CONFIRMATION"
  | "ACCEPTED"
  | "PREPARING"
  | "READY_FOR_PICKUP"
  | "SEARCHING_DRIVER"
  | "DRIVER_ASSIGNED"
  | "DRIVER_TO_PICKUP"
  | "PICKED_UP"
  | "IN_DELIVERY"
  | "DELIVERED"
  | "CANCELLED"
  | "REFUNDED"
  | "PAYMENT_FAILED"
  | "DISPUTED"
  | "EXPIRED";

/**
 * Mapa completo do ciclo de vida do pedido (seção 38). A Fase 4 só exercita
 * CREATED → FULFILLMENT_SELECTED → STOCK_RESERVED → AWAITING_PAYMENT (e as
 * saídas CANCELLED/EXPIRED); o restante é reservado para as fases de
 * pagamento, aceite do parceiro e entrega. Nunca permitir uma transição fora
 * deste mapa — é a garantia de que "não permitir transições arbitrárias".
 */
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  CREATED: ["FULFILLMENT_SELECTED", "CANCELLED"],
  FULFILLMENT_SELECTED: ["STOCK_RESERVED", "CANCELLED"],
  STOCK_RESERVED: ["AWAITING_PAYMENT", "CANCELLED", "EXPIRED"],
  AWAITING_PAYMENT: ["PAID", "PAYMENT_FAILED", "EXPIRED", "CANCELLED"],
  PAID: ["PARTNER_CONFIRMATION", "REFUNDED", "DISPUTED"],
  PARTNER_CONFIRMATION: ["ACCEPTED", "CANCELLED"],
  ACCEPTED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY_FOR_PICKUP", "CANCELLED"],
  READY_FOR_PICKUP: ["SEARCHING_DRIVER"],
  SEARCHING_DRIVER: ["DRIVER_ASSIGNED", "CANCELLED"],
  DRIVER_ASSIGNED: ["DRIVER_TO_PICKUP", "CANCELLED"],
  DRIVER_TO_PICKUP: ["PICKED_UP"],
  PICKED_UP: ["IN_DELIVERY"],
  IN_DELIVERY: ["DELIVERED", "DISPUTED"],
  DELIVERED: ["DISPUTED"],
  CANCELLED: [],
  REFUNDED: [],
  PAYMENT_FAILED: ["AWAITING_PAYMENT", "CANCELLED"],
  DISPUTED: ["REFUNDED", "DELIVERED"],
  EXPIRED: [],
};

export function assertValidTransition(from: OrderStatus, to: OrderStatus): void {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new Error(`Transição de pedido inválida: ${from} → ${to}`);
  }
}
