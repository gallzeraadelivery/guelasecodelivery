import type { FastifyInstance } from "fastify";
import { requireUserId, UnauthorizedError } from "../../lib/auth.js";
import { createServiceClient } from "../../lib/supabase.js";

export async function dispatchRoutes(app: FastifyInstance): Promise<void> {
  const db = createServiceClient(app.config);

  app.post<{ Params: { id: string } }>("/deliveries/offers/:id/accept", async (request, reply) => {
    let userId: string;
    try {
      userId = await requireUserId(request, db);
    } catch (error) {
      if (error instanceof UnauthorizedError) return reply.code(401).send({ error: error.message });
      throw error;
    }

    const { error } = await db.rpc("accept_delivery_offer", {
      p_offer_id: request.params.id,
      p_driver_id: userId,
    });

    if (error) {
      if (error.message.includes("OFFER_NOT_FOUND")) {
        return reply.code(404).send({ error: "Oferta não encontrada." });
      }
      if (error.message.includes("OFFER_NO_LONGER_AVAILABLE")) {
        return reply.code(409).send({ error: "Esta oferta não está mais disponível." });
      }
      app.log.error(error);
      return reply.code(500).send({ error: "Falha ao aceitar a oferta." });
    }

    return reply.send({ status: "ACCEPTED" });
  });

  app.post<{ Params: { id: string } }>("/deliveries/offers/:id/reject", async (request, reply) => {
    let userId: string;
    try {
      userId = await requireUserId(request, db);
    } catch (error) {
      if (error instanceof UnauthorizedError) return reply.code(401).send({ error: error.message });
      throw error;
    }

    const { error } = await db.rpc("reject_delivery_offer", {
      p_offer_id: request.params.id,
      p_driver_id: userId,
    });

    if (error) {
      if (error.message.includes("OFFER_NOT_FOUND")) {
        return reply.code(404).send({ error: "Oferta não encontrada." });
      }
      if (error.message.includes("OFFER_NO_LONGER_AVAILABLE")) {
        return reply.code(409).send({ error: "Esta oferta não está mais disponível." });
      }
      app.log.error(error);
      return reply.code(500).send({ error: "Falha ao recusar a oferta." });
    }

    return reply.send({ status: "REJECTED" });
  });
}
