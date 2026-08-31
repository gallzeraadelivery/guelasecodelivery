import type { FastifyInstance } from "fastify";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => ({
    status: "ok",
    service: "guela-seco-backend",
    timestamp: new Date().toISOString(),
  }));
}
