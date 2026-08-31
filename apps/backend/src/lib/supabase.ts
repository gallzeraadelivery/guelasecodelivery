import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "../env.js";

/**
 * Client autenticado como service_role — usado apenas no backend, nunca
 * exposto a mobile/web. Ignora RLS por padrão (BYPASSRLS), então todo
 * controle de acesso ao chamar isto tem que ser feito explicitamente no
 * código do backend, não delegado ao banco.
 */
export function createServiceClient(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
