import Fastify, { type FastifyInstance } from "fastify";
import type { Env } from "./env.js";
import { driversRoutes } from "./modules/drivers/drivers.routes.js";
import { healthRoutes } from "./modules/health/health.routes.js";
import { ordersRoutes } from "./modules/orders/orders.routes.js";
import { partnerOrderActionsRoutes } from "./modules/orders/partner-actions.routes.js";
import { partnersRoutes } from "./modules/partners/partners.routes.js";
import { paymentsRoutes } from "./modules/payments/payments.routes.js";
import { webhooksRoutes } from "./modules/payments/webhooks.routes.js";
import { dispatchRoutes } from "./modules/dispatch/dispatch.routes.js";
import { walletRoutes } from "./modules/wallet/wallet.routes.js";
import { adminRoutes } from "./modules/admin/admin.routes.js";

declare module "fastify" {
  interface FastifyInstance {
    config: Env;
  }
}

export function buildApp(env: Env): FastifyInstance {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "production" ? "info" : "debug",
      redact: ["req.headers.authorization"],
    },
  });

  app.decorate("config", env);

  app.register(healthRoutes);
  app.register(driversRoutes);
  app.register(ordersRoutes);
  app.register(partnerOrderActionsRoutes);
  app.register(partnersRoutes);
  app.register(paymentsRoutes);
  app.register(webhooksRoutes);
  app.register(dispatchRoutes);
  app.register(walletRoutes);
  app.register(adminRoutes);

  return app;
}
