import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

/**
 * Lê uma configuração de platform_settings. Nunca hardcode valores comerciais
 * ou operacionais no código (seção 24/42/62) — tudo vem daqui, para poder ser
 * ajustado pela administração sem deploy.
 */
export async function getSetting<T>(
  db: SupabaseClient,
  key: string,
  schema: z.ZodType<T>,
): Promise<T> {
  const { data, error } = await db
    .from("platform_settings")
    .select("value")
    .eq("key", key)
    .single();

  if (error || !data) {
    throw new Error(`Configuração obrigatória ausente: ${key}`);
  }

  return schema.parse(data.value);
}

export const serviceFeeRuleSchema = z.object({
  type: z.enum(["fixed", "percentage"]),
  amount_cents: z.number().int().nonnegative().nullable().optional(),
  percentage_bps: z.number().int().nonnegative().nullable().optional(),
  min_cents: z.number().int().nonnegative().nullable().optional(),
  max_cents: z.number().int().nonnegative().nullable().optional(),
});

export type ServiceFeeRule = z.infer<typeof serviceFeeRuleSchema>;
