import Fastify, { type FastifyInstance } from "fastify";
import type { Env } from "./env.js";
import { healthRoutes } from "./modules/health/health.routes.js";
import { ordersRoutes } from "./modules/orders/orders.routes.js";

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
  app.register(ordersRoutes);

  return app;
}
