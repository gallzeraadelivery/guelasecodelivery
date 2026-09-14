import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { requireUserId, UnauthorizedError } from "../../lib/auth.js";
import { createServiceClient } from "../../lib/supabase.js";

const NOT_FOUND_CODES = ["OFFER_NOT_FOUND", "DELIVERY_NOT_FOUND"];
const CONFLICT_CODES = ["OFFER_NO_LONGER_AVAILABLE", "INVALID_DELIVERY_STATE"];

export async function dispatchRoutes(app: FastifyInstance): Promise<void> {
  const db = createServiceClient(app.config);

  async function callDriverRpc(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
    rpcName: string,
    idParam: string,
    successStatus: string,
    genericErrorMessage: string,
  ) {
    let userId: string;
    try {
      userId = await requireUserId(request, db);
    } catch (error) {
      if (error instanceof UnauthorizedError) return reply.code(401).send({ error: error.message });
      throw error;
    }

    const { error } = await db.rpc(rpcName, { [idParam]: request.params.id, p_driver_id: userId });

    if (error) {
      if (NOT_FOUND_CODES.some((code) => error.message.includes(code))) {
        return reply.code(404).send({ error: "Não encontrado." });
      }
      if (error.message.includes("DRIVER_BALANCE_TOO_LOW")) {
        return reply.code(409).send({
          error:
            "Seu saldo está muito negativo pra aceitar entregas com pagamento na entrega. Repasse o que está pendente pra liberar.",
        });
      }
      if (CONFLICT_CODES.some((code) => error.message.includes(code))) {
        return reply.code(409).send({ error: "Esta ação não é mais válida para o estado atual." });
      }
      app.log.error(error);
      return reply.code(500).send({ error: genericErrorMessage });
    }

    return reply.send({ status: successStatus });
  }

  app.post<{ Params: { id: string } }>("/deliveries/offers/:id/accept", (request, reply) =>
    callDriverRpc(request, reply, "accept_delivery_offer", "p_offer_id", "ACCEPTED", "Falha ao aceitar a oferta."),
  );

  app.post<{ Params: { id: string } }>("/deliveries/offers/:id/reject", (request, reply) =>
    callDriverRpc(request, reply, "reject_delivery_offer", "p_offer_id", "REJECTED", "Falha ao recusar a oferta."),
  );

  app.post<{ Params: { id: string } }>("/deliveries/:id/arrived", (request, reply) =>
    callDriverRpc(
      request,
      reply,
      "mark_delivery_at_pickup",
      "p_delivery_id",
      "AT_PICKUP",
      "Falha ao registrar chegada.",
    ),
  );

  app.post<{ Params: { id: string } }>("/deliveries/:id/picked-up", (request, reply) =>
    callDriverRpc(
      request,
      reply,
      "mark_delivery_picked_up",
      "p_delivery_id",
      "DELIVERING",
      "Falha ao registrar retirada do pedido.",
    ),
  );

  app.post<{ Params: { id: string } }>("/deliveries/:id/delivered", (request, reply) =>
    callDriverRpc(
      request,
      reply,
      "mark_delivery_delivered",
      "p_delivery_id",
      "DELIVERED",
      "Falha ao registrar conclusão da entrega.",
    ),
  );

  // get_partner_location/get_address_location são restritas a service_role
  // (usadas internamente pelo dispatch), então o app do entregador não pode
  // chamá-las direto — este endpoint expõe só o necessário para o mapa/GPS
  // da corrida ativa, e apenas para o entregador dono da entrega.
  app.get<{ Params: { id: string } }>("/deliveries/:id/navigation", async (request, reply) => {
    let userId: string;
    try {
      userId = await requireUserId(request, db);
    } catch (error) {
      if (error instanceof UnauthorizedError) return reply.code(401).send({ error: error.message });
      throw error;
    }

    const { data: delivery } = await db
      .from("deliveries")
      .select("id, driver_id, status, pickup_partner_id, dropoff_address_id")
      .eq("id", request.params.id)
      .maybeSingle();

    if (!delivery || delivery.driver_id !== userId) {
      return reply.code(404).send({ error: "Entrega não encontrada." });
    }

    const [{ data: partner }, { data: address }, { data: pickupLocation }, { data: dropoffLocation }] =
      await Promise.all([
        db.from("partners").select("trade_name, address_line").eq("id", delivery.pickup_partner_id).maybeSingle(),
        db
          .from("addresses")
          .select("address_line, number, neighborhood, city")
          .eq("id", delivery.dropoff_address_id)
          .maybeSingle(),
        db.rpc("get_partner_location", { p_partner_id: delivery.pickup_partner_id }).maybeSingle<{
          lat: number;
          lng: number;
        }>(),
        db.rpc("get_address_location", { p_address_id: delivery.dropoff_address_id }).maybeSingle<{
          lat: number;
          lng: number;
        }>(),
      ]);

    return reply.send({
      target: delivery.status === "DELIVERING" ? "DROPOFF" : "PICKUP",
      pickup: {
        label: partner?.trade_name ?? "Distribuidora",
        addressText: partner?.address_line ?? null,
        lat: pickupLocation?.lat ?? null,
        lng: pickupLocation?.lng ?? null,
      },
      dropoff: {
        label: "Cliente",
        addressText: address
          ? [address.address_line, address.number, address.neighborhood, address.city].filter(Boolean).join(", ")
          : null,
        lat: dropoffLocation?.lat ?? null,
        lng: dropoffLocation?.lng ?? null,
      },
    });
  });

  // order_items só tem RLS pra customer/partner — o entregador não enxerga
  // direto, então este endpoint expõe só nome+quantidade dos itens da
  // entrega ativa dele, pra conferência na retirada.
  app.get<{ Params: { id: string } }>("/deliveries/:id/items", async (request, reply) => {
    let userId: string;
    try {
      userId = await requireUserId(request, db);
    } catch (error) {
      if (error instanceof UnauthorizedError) return reply.code(401).send({ error: error.message });
      throw error;
    }

    const { data: delivery } = await db
      .from("deliveries")
      .select("id, driver_id, order_id")
      .eq("id", request.params.id)
      .maybeSingle();

    if (!delivery || delivery.driver_id !== userId) {
      return reply.code(404).send({ error: "Entrega não encontrada." });
    }

    const { data: items } = await db
      .from("order_items")
      .select("id, quantity, catalog_products(name)")
      .eq("order_id", delivery.order_id);

    return reply.send({
      items: (items ?? []).map((item) => {
        const product = Array.isArray(item.catalog_products) ? item.catalog_products[0] : item.catalog_products;
        return {
          id: item.id,
          quantity: item.quantity,
          productName: (product as { name: string } | undefined)?.name ?? "Item",
        };
      }),
    });
  });
}
