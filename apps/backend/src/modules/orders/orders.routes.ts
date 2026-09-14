import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUserId, UnauthorizedError } from "../../lib/auth.js";
import { createServiceClient } from "../../lib/supabase.js";
import { cancelOrder, createOrder, getOrderDetails, getOrderTracking } from "./orders.service.js";
import {
  AddressWithoutLocationError,
  EmptyCartError,
  NoEligiblePartnerError,
  OrderNotCancellableError,
  OrderNotFoundError,
  StockConflictError,
} from "./orders.errors.js";
import { getSetting } from "../../lib/settings.js";
import { getPaymentProvider } from "../../providers/index.js";

const supportContactSchema = z.object({ whatsapp: z.string() });

const createOrderBodySchema = z.object({
  addressId: z.string().uuid(),
  items: z
    .array(
      z.object({
        catalogProductId: z.string().uuid(),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1),
  paymentMethod: z.enum(["ONLINE", "CASH_ON_DELIVERY"]).default("ONLINE"),
});

export async function ordersRoutes(app: FastifyInstance): Promise<void> {
  const db = createServiceClient(app.config);

  app.post("/orders", async (request, reply) => {
    let userId: string;
    try {
      userId = await requireUserId(request, db);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return reply.code(401).send({ error: error.message });
      }
      throw error;
    }

    const parsed = createOrderBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Corpo da requisição inválido.", details: parsed.error.issues });
    }

    try {
      const result = await createOrder(db, {
        customerId: userId,
        addressId: parsed.data.addressId,
        items: parsed.data.items,
        paymentMethod: parsed.data.paymentMethod,
      });
      return reply.code(201).send(result);
    } catch (error) {
      if (error instanceof EmptyCartError) {
        return reply.code(400).send({ error: error.message });
      }
      if (error instanceof AddressWithoutLocationError || error instanceof NoEligiblePartnerError) {
        return reply.code(422).send({ error: error.message });
      }
      if (error instanceof StockConflictError) {
        return reply.code(409).send({ error: error.message });
      }
      app.log.error(error);
      return reply.code(500).send({ error: "Falha ao criar pedido." });
    }
  });

  app.get<{ Params: { id: string } }>("/orders/:id", async (request, reply) => {
    let userId: string;
    try {
      userId = await requireUserId(request, db);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return reply.code(401).send({ error: error.message });
      }
      throw error;
    }

    try {
      const details = await getOrderDetails(db, request.params.id, userId);
      return reply.send(details);
    } catch (error) {
      if (error instanceof OrderNotFoundError) {
        return reply.code(404).send({ error: error.message });
      }
      app.log.error(error);
      return reply.code(500).send({ error: "Falha ao buscar pedido." });
    }
  });

  app.get<{ Params: { id: string } }>("/orders/:id/tracking", async (request, reply) => {
    let userId: string;
    try {
      userId = await requireUserId(request, db);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return reply.code(401).send({ error: error.message });
      }
      throw error;
    }

    try {
      const tracking = await getOrderTracking(db, request.params.id, userId);
      return reply.send(tracking);
    } catch (error) {
      if (error instanceof OrderNotFoundError) {
        return reply.code(404).send({ error: error.message });
      }
      app.log.error(error);
      return reply.code(500).send({ error: "Falha ao buscar localização do pedido." });
    }
  });

  app.post<{ Params: { id: string } }>("/orders/:id/cancel", async (request, reply) => {
    let userId: string;
    try {
      userId = await requireUserId(request, db);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return reply.code(401).send({ error: error.message });
      }
      throw error;
    }

    let provider;
    try {
      provider = getPaymentProvider(app.config);
    } catch {
      provider = null;
    }

    try {
      await cancelOrder(db, provider, request.params.id, userId);
    } catch (error) {
      if (error instanceof OrderNotFoundError) {
        return reply.code(404).send({ error: error.message });
      }
      if (error instanceof OrderNotCancellableError) {
        return reply.code(409).send({ error: error.message });
      }
      app.log.error(error);
      return reply.code(500).send({ error: "Falha ao cancelar o pedido." });
    }

    return reply.send({ status: "CANCELLED" });
  });

  app.get("/support/contact", async (request, reply) => {
    try {
      await requireUserId(request, db);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return reply.code(401).send({ error: error.message });
      }
      throw error;
    }

    const contact = await getSetting(db, "support_contact", supportContactSchema);
    return reply.send(contact);
  });
}
