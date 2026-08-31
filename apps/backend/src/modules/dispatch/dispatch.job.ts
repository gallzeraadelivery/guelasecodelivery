import type { FastifyBaseLogger } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runDispatchSweep } from "./dispatch.service.js";

/**
 * Varredura periódica do dispatch (seção 27) — roda em processo dentro do
 * backend nesta fase, como o job de expiração de reserva de estoque (Fase 4).
 * Intervalo curto porque ofertas expiram em segundos, não minutos.
 */
export function startDispatchSweepJob(
  db: SupabaseClient,
  logger: FastifyBaseLogger,
  intervalMs = 10_000,
): NodeJS.Timeout {
  return setInterval(() => {
    runDispatchSweep(db).catch((error) => {
      logger.error({ error }, "Falha na varredura de dispatch");
    });
  }, intervalMs);
}
