import { describe, expect, it } from "vitest";
import { buildApp } from "../app.js";

const testEnv = {
  NODE_ENV: "test" as const,
  PORT: 3333,
  SUPABASE_URL: "http://localhost:54321",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
};

describe("GET /health", () => {
  it("returns ok status", async () => {
    const app = buildApp(testEnv);
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ok", service: "guela-seco-backend" });

    await app.close();
  });
});
