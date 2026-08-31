import { z } from "zod";

/**
 * Only variables actually consumed by the backend at this phase are required.
 * Variables needed by later phases (payments, maps, KYC...) are documented in
 * .env.example but validated here only once the modules that use them land,
 * so a missing future secret never blocks booting the app today.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "staging", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3333),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // URL pública deste backend (ex.: https://api.guelaseco.com.br), usada para montar
  // redirect_uri/notification_url do Mercado Pago. Opcional até a Fase 5 ser
  // configurada com credenciais reais; sem ela, as rotas de pagamento retornam erro
  // claro em vez de derrubar o boot do servidor.
  BACKEND_PUBLIC_URL: z.string().url().optional(),
  MERCADOPAGO_CLIENT_ID: z.string().min(1).optional(),
  MERCADOPAGO_CLIENT_SECRET: z.string().min(1).optional(),
  MERCADOPAGO_WEBHOOK_SECRET: z.string().min(1).optional(),
  BITCOINP2P_API_KEY: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid environment configuration:\n${issues.join("\n")}`);
  }
  return parsed.data;
}
