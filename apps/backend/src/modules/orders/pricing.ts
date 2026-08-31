import type { ServiceFeeRule } from "../../lib/settings.js";

/**
 * Nunca usar float para dinheiro (seção 16/50) — tudo em centavos inteiros.
 * A regra é lida de platform_settings a cada pedido e o resultado vira
 * snapshot no pedido (seção 43): mudar a configuração depois nunca altera
 * pedidos já criados.
 */
export function computeServiceFeeCents(subtotalCents: number, rule: ServiceFeeRule): number {
  let fee: number;

  if (rule.type === "fixed") {
    fee = rule.amount_cents ?? 0;
  } else {
    const bps = rule.percentage_bps ?? 0;
    fee = Math.round((subtotalCents * bps) / 10_000);
  }

  if (rule.min_cents != null) fee = Math.max(fee, rule.min_cents);
  if (rule.max_cents != null) fee = Math.min(fee, rule.max_cents);

  return fee;
}
