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
}
