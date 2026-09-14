import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAdminId, UnauthorizedError } from "../../lib/auth.js";
import { createServiceClient } from "../../lib/supabase.js";
import {
  approveWithdrawal,
  closeSupportTicket,
  failWithdrawal,
  getFinancialSummary,
  getSettingHistory,
  getSupportMessages,
  listAuditLogs,
  listPartnerSettlements,
  listSettings,
  listSupportTickets,
  listWithdrawals,
  sendSupportMessageAsAdmin,
  settlePartnerSettlement,
  SettingNotFoundError,
  SettlementNotFoundError,
  SupportTicketNotFoundError,
  updateSetting,
} from "./admin.service.js";
import { getAntifraudeFlags } from "./antifraude.service.js";

const updateSettingBodySchema = z.object({ value: z.unknown() });
const approveWithdrawalBodySchema = z.object({ externalId: z.string().optional() });
const failWithdrawalBodySchema = z.object({ reason: z.string().min(1) });
const sendSupportMessageBodySchema = z.object({ body: z.string().min(1) });

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  const db = createServiceClient(app.config);

  async function withAdmin(
    request: FastifyRequest,
    reply: FastifyReply,
    handler: (adminId: string) => Promise<void>,
  ) {
    let adminId: string;
    try {
      adminId = await requireAdminId(request, db);
    } catch (error) {
      if (error instanceof UnauthorizedError) return reply.code(401).send({ error: error.message });
      throw error;
    }
    return handler(adminId);
  }

  app.get("/admin/settings", (request, reply) =>
    withAdmin(request, reply, async () => {
      const settings = await listSettings(db);
      return reply.send({ settings });
    }),
  );

  app.get<{ Params: { key: string } }>("/admin/settings/:key/history", (request, reply) =>
    withAdmin(request, reply, async () => {
      const history = await getSettingHistory(db, request.params.key);
      return reply.send({ history });
    }),
  );

  app.patch<{ Params: { key: string } }>("/admin/settings/:key", (request, reply) =>
    withAdmin(request, reply, async (adminId) => {
      const parsed = updateSettingBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Corpo da requisição inválido.", details: parsed.error.issues });
      }

      try {
        await updateSetting(db, request.params.key, parsed.data.value, adminId);
      } catch (error) {
        if (error instanceof SettingNotFoundError) return reply.code(404).send({ error: error.message });
        throw error;
      }

      return reply.send({ status: "UPDATED" });
    }),
  );

  app.get("/admin/financeiro/summary", (request, reply) =>
    withAdmin(request, reply, async () => {
      const summary = await getFinancialSummary(db);
      return reply.send(summary);
    }),
  );

  app.get<{ Querystring: { status?: string } }>("/admin/withdrawals", (request, reply) =>
    withAdmin(request, reply, async () => {
      const withdrawals = await listWithdrawals(db, request.query.status);
      return reply.send({ withdrawals });
    }),
  );

  app.post<{ Params: { id: string } }>("/admin/withdrawals/:id/approve", (request, reply) =>
    withAdmin(request, reply, async (adminId) => {
      const parsed = approveWithdrawalBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: "Corpo da requisição inválido.", details: parsed.error.issues });
      }

      try {
        await approveWithdrawal(db, request.params.id, adminId, parsed.data.externalId);
      } catch (error) {
        app.log.error(error);
        return reply.code(422).send({ error: (error as Error).message });
      }

      return reply.send({ status: "PAID" });
    }),
  );

  app.post<{ Params: { id: string } }>("/admin/withdrawals/:id/fail", (request, reply) =>
    withAdmin(request, reply, async (adminId) => {
      const parsed = failWithdrawalBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Corpo da requisição inválido.", details: parsed.error.issues });
      }

      try {
        await failWithdrawal(db, request.params.id, adminId, parsed.data.reason);
      } catch (error) {
        app.log.error(error);
        return reply.code(422).send({ error: (error as Error).message });
      }

      return reply.send({ status: "FAILED" });
    }),
  );

  app.get<{ Querystring: { status?: string } }>("/admin/partner-settlements", (request, reply) =>
    withAdmin(request, reply, async () => {
      const settlements = await listPartnerSettlements(db, request.query.status);
      return reply.send({ settlements });
    }),
  );

  app.post<{ Params: { id: string } }>("/admin/partner-settlements/:id/settle", (request, reply) =>
    withAdmin(request, reply, async (adminId) => {
      try {
        await settlePartnerSettlement(db, request.params.id, adminId);
      } catch (error) {
        if (error instanceof SettlementNotFoundError) return reply.code(404).send({ error: error.message });
        app.log.error(error);
        return reply.code(500).send({ error: "Falha ao marcar repasse como pago." });
      }

      return reply.send({ status: "SETTLED" });
    }),
  );

  app.get("/admin/audit", (request, reply) =>
    withAdmin(request, reply, async () => {
      const logs = await listAuditLogs(db);
      return reply.send({ logs });
    }),
  );

  app.get<{ Querystring: { status?: string } }>("/admin/support/tickets", (request, reply) =>
    withAdmin(request, reply, async () => {
      const tickets = await listSupportTickets(db, request.query.status);
      return reply.send({ tickets });
    }),
  );

  app.get<{ Params: { id: string } }>("/admin/support/tickets/:id/messages", (request, reply) =>
    withAdmin(request, reply, async () => {
      const messages = await getSupportMessages(db, request.params.id);
      return reply.send({ messages });
    }),
  );

  app.post<{ Params: { id: string } }>("/admin/support/tickets/:id/messages", (request, reply) =>
    withAdmin(request, reply, async (adminId) => {
      const parsed = sendSupportMessageBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Corpo da requisição inválido.", details: parsed.error.issues });
      }

      try {
        await sendSupportMessageAsAdmin(db, request.params.id, adminId, parsed.data.body);
      } catch (error) {
        if (error instanceof SupportTicketNotFoundError) return reply.code(404).send({ error: error.message });
        app.log.error(error);
        return reply.code(500).send({ error: "Falha ao enviar mensagem." });
      }

      return reply.send({ status: "SENT" });
    }),
  );

  app.post<{ Params: { id: string } }>("/admin/support/tickets/:id/close", (request, reply) =>
    withAdmin(request, reply, async () => {
      try {
        await closeSupportTicket(db, request.params.id);
      } catch (error) {
        if (error instanceof SupportTicketNotFoundError) return reply.code(404).send({ error: error.message });
        app.log.error(error);
        return reply.code(500).send({ error: "Falha ao fechar chamado." });
      }

      return reply.send({ status: "CLOSED" });
    }),
  );

  app.get("/admin/antifraude/flags", (request, reply) =>
    withAdmin(request, reply, async () => {
      const flags = await getAntifraudeFlags(db);
      return reply.send(flags);
    }),
  );
}
