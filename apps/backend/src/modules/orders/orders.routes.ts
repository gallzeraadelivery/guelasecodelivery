import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUserId, UnauthorizedError } from "../../lib/auth.js";
import { createServiceClient } from "../../lib/supabase.js";
import { createOrder } from "./orders.service.js";
import {
  AddressWithoutLocationError,
  EmptyCartError,
  NoEligiblePartnerError,
  StockConflictError,
} from "./orders.errors.js";

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

    const { data: order, error } = await db
      .from("orders")
      .select(
        "id, status, partner_id, subtotal_cents, service_fee_cents, delivery_fee_cents, total_cents, created_at",
      )
      .eq("id", request.params.id)
      .eq("customer_id", userId)
      .maybeSingle();

    if (error) {
      app.log.error(error);
      return reply.code(500).send({ error: "Falha ao buscar pedido." });
    }
    if (!order) {
      return reply.code(404).send({ error: "Pedido não encontrado." });
    }

    return reply.send(order);
  });
}
