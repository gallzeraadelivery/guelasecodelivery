import type { FastifyInstance } from "fastify";
import { requireUserId, UnauthorizedError } from "../../lib/auth.js";
import { createServiceClient } from "../../lib/supabase.js";
import { transitionOrder } from "./orders.repository.js";
import { startDispatchForOrder } from "../dispatch/dispatch.service.js";

async function requirePartnerOrder(db: ReturnType<typeof createServiceClient>, orderId: string, userId: string) {
  const { data: order } = await db.from("orders").select("id, partner_id, status").eq("id", orderId).maybeSingle();
  if (!order || !order.partner_id) return null;

  const { data: membership } = await db
    .from("partner_users")
    .select("partner_id")
    .eq("partner_id", order.partner_id)
    .eq("profile_id", userId)
    .maybeSingle();

  return membership ? order : null;
}

/**
 * Fluxo do parceiro entre o pagamento confirmado e o início do dispatch
 * (seção 2 — "Aceita e prepara" acontece antes de "GUELA SECO procura o
 * melhor entregador"). Simplificado a duas ações: aceitar (que já cobre
 * ACCEPTED + PREPARING — não há uma ação real distinta entre elas) e marcar
 * pronto (que dispara o dispatch).
 */
export async function partnerOrderActionsRoutes(app: FastifyInstance): Promise<void> {
  const db = createServiceClient(app.config);

  app.post<{ Params: { id: string } }>("/orders/:id/accept", async (request, reply) => {
    let userId: string;
    try {
      userId = await requireUserId(request, db);
    } catch (error) {
      if (error instanceof UnauthorizedError) return reply.code(401).send({ error: error.message });
      throw error;
    }

    const order = await requirePartnerOrder(db, request.params.id, userId);
    if (!order) return reply.code(404).send({ error: "Pedido não encontrado." });
    if (order.status !== "PARTNER_CONFIRMATION") {
      return reply.code(422).send({ error: "Este pedido não está aguardando confirmação da distribuidora." });
    }

    await transitionOrder(db, order.id, "PARTNER_CONFIRMATION", "ACCEPTED", { actor: "partner" });
    await transitionOrder(db, order.id, "ACCEPTED", "PREPARING", { actor: "partner" });

    return reply.send({ status: "PREPARING" });
  });

  app.post<{ Params: { id: string } }>("/orders/:id/ready", async (request, reply) => {
    let userId: string;
    try {
      userId = await requireUserId(request, db);
    } catch (error) {
      if (error instanceof UnauthorizedError) return reply.code(401).send({ error: error.message });
      throw error;
    }

    const order = await requirePartnerOrder(db, request.params.id, userId);
    if (!order) return reply.code(404).send({ error: "Pedido não encontrado." });
    if (order.status !== "PREPARING") {
      return reply.code(422).send({ error: "Este pedido não está em preparo." });
    }

    await transitionOrder(db, order.id, "PREPARING", "READY_FOR_PICKUP", { actor: "partner" });
    await transitionOrder(db, order.id, "READY_FOR_PICKUP", "SEARCHING_DRIVER", { actor: "system" });
    await startDispatchForOrder(db, order.id);

    return reply.send({ status: "SEARCHING_DRIVER" });
  });
}
