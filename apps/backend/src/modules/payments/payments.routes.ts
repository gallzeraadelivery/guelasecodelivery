import type { FastifyInstance } from "fastify";
import { requireUserId, UnauthorizedError } from "../../lib/auth.js";
import { createServiceClient } from "../../lib/supabase.js";
import { getPaymentProvider } from "../../providers/index.js";
import { createCheckoutForOrder } from "./payments.service.js";
import { OrderNotPayableError, PartnerNotConnectedError } from "./payments.errors.js";

export async function paymentsRoutes(app: FastifyInstance): Promise<void> {
  const db = createServiceClient(app.config);

  app.post<{ Params: { id: string } }>("/orders/:id/checkout", async (request, reply) => {
    let userId: string;
    try {
      userId = await requireUserId(request, db);
    } catch (error) {
      if (error instanceof UnauthorizedError) return reply.code(401).send({ error: error.message });
      throw error;
    }

    let provider;
    try {
      provider = getPaymentProvider(app.config);
    } catch (error) {
      return reply.code(503).send({ error: (error as Error).message });
    }

    try {
      const result = await createCheckoutForOrder(db, provider, app.config, request.params.id, userId);
      return reply.send(result);
    } catch (error) {
      if (error instanceof OrderNotPayableError) {
        return reply.code(422).send({ error: error.message });
      }
      if (error instanceof PartnerNotConnectedError) {
        return reply.code(409).send({ error: error.message });
      }
      app.log.error(error);
      return reply.code(500).send({ error: "Falha ao iniciar checkout." });
    }
  });
}
