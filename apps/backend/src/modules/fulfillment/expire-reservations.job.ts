import type { FastifyBaseLogger } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Varre reservas de estoque PENDING vencidas e libera o estoque (seção 17).
 * Roda em processo dentro do backend nesta fase — migrar para um scheduler
 * dedicado (Supabase Cron, cron job do provedor de hospedagem) é um ajuste de
 * infraestrutura para quando houver mais de uma instância do backend, não
 * uma mudança na lógica.
 */
export function startReservationExpiryJob(
  db: SupabaseClient,
  logger: FastifyBaseLogger,
  intervalMs = 60_000,
): NodeJS.Timeout {
  return setInterval(() => {
    db.rpc("release_expired_reservations").then(({ data, error }) => {
      if (error) {
        logger.error({ error }, "Falha ao liberar reservas de estoque expiradas");
        return;
      }
      if (typeof data === "number" && data > 0) {
        logger.info({ released: data }, "Reservas de estoque expiradas liberadas");
      }
    });
  }, intervalMs);
}
