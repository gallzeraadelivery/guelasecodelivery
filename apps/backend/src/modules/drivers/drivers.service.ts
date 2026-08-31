import type { SupabaseClient } from "@supabase/supabase-js";
import type { KYCProvider, KycSubmissionInput } from "../../providers/kyc-provider.js";

export async function submitDriverKyc(
  db: SupabaseClient,
  provider: KYCProvider,
  input: KycSubmissionInput,
): Promise<{ status: string }> {
  const result = await provider.submitCheck(input);

  const { error } = await db.from("kyc_checks").insert({
    driver_id: input.driverId,
    provider: "bitcoinp2p",
    external_check_id: result.externalCheckId,
    status: result.status,
    checks: result.checks,
    raw_response: result.raw as never,
  });

  if (error) {
    throw new Error(`Falha ao registrar verificação de KYC: ${error.message}`);
  }

  // drivers.kyc_status é sincronizado automaticamente por trigger (migration
  // kyc_checks_sync_driver_status) — nada a fazer aqui além de inserir.
  return { status: result.status };
}
