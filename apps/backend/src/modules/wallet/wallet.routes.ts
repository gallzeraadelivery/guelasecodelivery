import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUserId, UnauthorizedError } from "../../lib/auth.js";
import { createServiceClient } from "../../lib/supabase.js";
import { requestWithdrawal, WithdrawalError } from "./wallet.service.js";

const requestWithdrawalBodySchema = z.object({
  amountCents: z.number().int().positive(),
  pixKey: z.string().min(1),
  pixKeyType: z.enum(["CPF", "CNPJ", "EMAIL", "PHONE", "RANDOM"]),
  holderName: z.string().min(1),
});

const ERROR_MESSAGES: Record<string, string> = {
  WITHDRAWAL_BELOW_MINIMUM: "Valor abaixo do mínimo permitido para saque.",
  WITHDRAWAL_ABOVE_MAXIMUM: "Valor acima do máximo permitido para saque.",
  WALLET_NOT_FOUND: "Carteira não encontrada.",
  INSUFFICIENT_BALANCE: "Saldo disponível insuficiente para este saque.",
};

export async function walletRoutes(app: FastifyInstance): Promise<void> {
  const db = createServiceClient(app.config);

  app.post("/wallet/withdrawals", async (request, reply) => {
    let userId: string;
    try {
      userId = await requireUserId(request, db);
    } catch (error) {
      if (error instanceof UnauthorizedError) return reply.code(401).send({ error: error.message });
      throw error;
    }

    const parsed = requestWithdrawalBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Corpo da requisição inválido.", details: parsed.error.issues });
    }

    try {
      const result = await requestWithdrawal(db, { driverId: userId, ...parsed.data });
      return reply.code(202).send({ withdrawalId: result.withdrawalId, status: "REQUESTED" });
    } catch (error) {
      if (error instanceof WithdrawalError) {
        const status = error.code === "INSUFFICIENT_BALANCE" ? 409 : 422;
        return reply.code(status).send({ error: ERROR_MESSAGES[error.code] ?? error.message });
      }
      app.log.error(error);
      return reply.code(500).send({ error: "Falha ao solicitar saque." });
    }
  });
}
