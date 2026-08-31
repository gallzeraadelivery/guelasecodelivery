import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUserId, UnauthorizedError } from "../../lib/auth.js";
import { createServiceClient } from "../../lib/supabase.js";
import { getKycProvider } from "../../providers/index.js";
import { submitDriverKyc } from "./drivers.service.js";

const submitKycBodySchema = z.object({
  cpf: z.string().min(11),
  cnhNumber: z.string().min(1),
  cnhCategory: z.string().min(1),
  selfieBase64: z.string().optional(),
  documentFrontBase64: z.string().optional(),
  documentBackBase64: z.string().optional(),
});

export async function driversRoutes(app: FastifyInstance): Promise<void> {
  const db = createServiceClient(app.config);

  app.post("/drivers/kyc", async (request, reply) => {
    let userId: string;
    try {
      userId = await requireUserId(request, db);
    } catch (error) {
      if (error instanceof UnauthorizedError) return reply.code(401).send({ error: error.message });
      throw error;
    }

    const parsed = submitKycBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Corpo da requisição inválido.", details: parsed.error.issues });
    }

    let provider;
    try {
      provider = getKycProvider(app.config);
    } catch (error) {
      return reply.code(503).send({ error: (error as Error).message });
    }

    try {
      const result = await submitDriverKyc(db, provider, { driverId: userId, ...parsed.data });
      return reply.code(202).send(result);
    } catch (error) {
      app.log.error(error);
      return reply.code(502).send({ error: "Falha ao enviar verificação para o provedor de KYC." });
    }
  });
}
