import type { SupabaseClient } from "@supabase/supabase-js";
import { getSetting, withdrawalRuleSchema } from "../../lib/settings.js";

export type RequestWithdrawalInput = {
  driverId: string;
  amountCents: number;
  pixKey: string;
  pixKeyType: "CPF" | "CNPJ" | "EMAIL" | "PHONE" | "RANDOM";
  holderName: string;
};

export class WithdrawalError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
  }
}

const KNOWN_RPC_ERRORS = [
  "WITHDRAWAL_BELOW_MINIMUM",
  "WITHDRAWAL_ABOVE_MAXIMUM",
  "WALLET_NOT_FOUND",
  "INSUFFICIENT_BALANCE",
];

export async function requestWithdrawal(
  db: SupabaseClient,
  input: RequestWithdrawalInput,
): Promise<{ withdrawalId: string }> {
  const rule = await getSetting(db, "withdrawal_rule", withdrawalRuleSchema);

  const { data, error } = await db.rpc("request_withdrawal", {
    p_driver_id: input.driverId,
    p_amount_cents: input.amountCents,
    p_pix_key: input.pixKey,
    p_pix_key_type: input.pixKeyType,
    p_holder_name: input.holderName,
    p_min_cents: rule.min_cents,
    p_max_cents: rule.max_cents,
  });

  if (error) {
    const knownCode = KNOWN_RPC_ERRORS.find((code) => error.message.includes(code));
    if (knownCode) {
      throw new WithdrawalError(error.message, knownCode);
    }
    throw new Error(`Falha ao solicitar saque: ${error.message}`);
  }

  return { withdrawalId: data as string };
}
