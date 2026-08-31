import type { FastifyInstance } from "fastify";
import { requireUserId, UnauthorizedError } from "../../lib/auth.js";
import { createServiceClient } from "../../lib/supabase.js";
import { getPaymentProvider } from "../../providers/index.js";
import { signPartnerState, verifyPartnerState } from "./oauth-state.js";

export async function partnersRoutes(app: FastifyInstance): Promise<void> {
  const db = createServiceClient(app.config);

  app.get<{ Params: { id: string } }>("/partners/:id/mercadopago/connect", async (request, reply) => {
    let userId: string;
    try {
      userId = await requireUserId(request, db);
    } catch (error) {
      if (error instanceof UnauthorizedError) return reply.code(401).send({ error: error.message });
      throw error;
    }

    const { data: membership } = await db
      .from("partner_users")
      .select("role")
      .eq("partner_id", request.params.id)
      .eq("profile_id", userId)
      .maybeSingle();

    if (!membership || membership.role !== "owner") {
      return reply.code(403).send({ error: "Apenas o responsável pela distribuidora pode conectar o Mercado Pago." });
    }

    let provider;
    try {
      provider = getPaymentProvider(app.config);
    } catch (error) {
      return reply.code(503).send({ error: (error as Error).message });
    }

    const state = signPartnerState(request.params.id, app.config.MERCADOPAGO_CLIENT_SECRET as string);
    return reply.send({ url: provider.getOAuthConnectUrl(state) });
  });

  app.get<{ Querystring: { code?: string; state?: string } }>(
    "/partners/mercadopago/callback",
    async (request, reply) => {
      const { code, state } = request.query;

      let provider;
      try {
        provider = getPaymentProvider(app.config);
      } catch (error) {
        return reply.code(503).send({ error: (error as Error).message });
      }

      if (!code || !state) {
        return reply.code(400).send({ error: "Callback inválido: code/state ausentes." });
      }

      const partnerId = verifyPartnerState(state, app.config.MERCADOPAGO_CLIENT_SECRET as string);
      if (!partnerId) {
        return reply.code(400).send({ error: "state inválido — inicie a conexão novamente pelo painel." });
      }

      const tokens = await provider.exchangeOAuthCode(code);

      await db.from("partner_payment_accounts").upsert({
        partner_id: partnerId,
        provider: "mercadopago",
        external_user_id: tokens.externalUserId,
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        public_key: tokens.publicKey,
        scope: tokens.scope,
        token_expires_at: tokens.expiresInSeconds
          ? new Date(Date.now() + tokens.expiresInSeconds * 1000).toISOString()
          : null,
      });

      await db.from("partners").update({ mercadopago_account_id: tokens.externalUserId }).eq("id", partnerId);

      return reply.type("text/html").send(
        "<html><body style=\"font-family:sans-serif;text-align:center;padding:40px\">" +
          "<h1>Mercado Pago conectado!</h1>" +
          "<p>Pode fechar esta aba e voltar ao painel da distribuidora.</p>" +
          "</body></html>",
      );
    },
  );
}
