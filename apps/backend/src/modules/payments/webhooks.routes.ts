import type { FastifyInstance } from "fastify";
import { createServiceClient } from "../../lib/supabase.js";
import { getPaymentProvider } from "../../providers/index.js";
import type { WebhookHeaders } from "../../providers/payment-provider.js";
import { applyPaymentWebhookEvent } from "./payments.service.js";

/**
 * Webhook do Mercado Pago — nunca confiar no retorno do app para confirmar
 * pagamento (seção 23). Idempotente via unique index em payment_events
 * (provider, external_event_id); assinatura verificada antes de processar.
 */
export async function webhooksRoutes(app: FastifyInstance): Promise<void> {
  const db = createServiceClient(app.config);

  app.post("/webhooks/mercadopago", async (request, reply) => {
    let provider;
    try {
      provider = getPaymentProvider(app.config);
    } catch {
      app.log.warn("Webhook do Mercado Pago recebido, mas o provider não está configurado ainda.");
      return reply.code(200).send({ received: true });
    }

    const headers = request.headers as WebhookHeaders;
    const event = provider.extractWebhookEvent(request.body, headers);

    if (!event?.paymentExternalId) {
      return reply.code(200).send({ received: true });
    }

    const { error: insertError } = await db.from("payment_events").insert({
      provider: "mercadopago",
      external_event_id: event.externalEventId,
      event_type: event.type,
      raw_payload: request.body as never,
    });

    if (insertError) {
      if (insertError.code === "23505") {
        return reply.code(200).send({ received: true, duplicate: true });
      }
      app.log.error(insertError, "Falha ao registrar payment_event");
      return reply.code(500).send({ error: "Falha ao registrar evento." });
    }

    if (!provider.verifyWebhookSignature(headers, event.paymentExternalId)) {
      await db
        .from("payment_events")
        .update({ processing_error: "invalid_signature", processed_at: new Date().toISOString() })
        .eq("provider", "mercadopago")
        .eq("external_event_id", event.externalEventId);
      return reply.code(401).send({ error: "Assinatura inválida." });
    }

    try {
      const result = await applyPaymentWebhookEvent(db, provider, event.paymentExternalId);
      await db
        .from("payment_events")
        .update({ processed_at: new Date().toISOString() })
        .eq("provider", "mercadopago")
        .eq("external_event_id", event.externalEventId);
      return reply.code(200).send({ received: true, orderId: result.orderId });
    } catch (error) {
      app.log.error(error, "Falha ao processar webhook do Mercado Pago");
      await db
        .from("payment_events")
        .update({ processing_error: (error as Error).message })
        .eq("provider", "mercadopago")
        .eq("external_event_id", event.externalEventId);
      return reply.code(500).send({ error: "Falha ao processar evento." });
    }
  });
}
