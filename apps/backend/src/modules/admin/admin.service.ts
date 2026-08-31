import type { SupabaseClient } from "@supabase/supabase-js";

export type PlatformSettingRow = {
  key: string;
  value: unknown;
  description: string | null;
  updated_at: string;
  updated_by: string | null;
};

export async function listSettings(db: SupabaseClient): Promise<PlatformSettingRow[]> {
  const { data, error } = await db
    .from("platform_settings")
    .select("key, value, description, updated_at, updated_by")
    .order("key");

  if (error) throw new Error(`Falha ao listar configurações: ${error.message}`);
  return data ?? [];
}

export class SettingNotFoundError extends Error {}

export async function updateSetting(
  db: SupabaseClient,
  key: string,
  value: unknown,
  adminId: string,
): Promise<void> {
  const { data, error } = await db
    .from("platform_settings")
    .update({ value, updated_by: adminId })
    .eq("key", key)
    .select("key")
    .maybeSingle();

  if (error) throw new Error(`Falha ao atualizar configuração: ${error.message}`);
  if (!data) throw new SettingNotFoundError(`Configuração não encontrada: ${key}`);
}

export type SettingHistoryRow = {
  id: string;
  old_value: unknown;
  new_value: unknown;
  changed_by: string | null;
  changed_at: string;
};

export async function getSettingHistory(db: SupabaseClient, key: string): Promise<SettingHistoryRow[]> {
  const { data, error } = await db
    .from("setting_history")
    .select("id, old_value, new_value, changed_by, changed_at")
    .eq("setting_key", key)
    .order("changed_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(`Falha ao buscar histórico: ${error.message}`);
  return data ?? [];
}

export type FinancialSummary = {
  delivered_orders_count: number;
  gross_revenue_cents: number;
  service_fee_revenue_cents: number;
  delivery_fee_cents: number;
  driver_payouts_credited_cents: number;
  withdrawals_paid_cents: number;
  withdrawals_pending_cents: number;
  withdrawals_pending_count: number;
};

export async function getFinancialSummary(db: SupabaseClient): Promise<FinancialSummary> {
  const { data, error } = await db.rpc("admin_financial_summary").single();
  if (error) throw new Error(`Falha ao calcular resumo financeiro: ${error.message}`);
  return data as FinancialSummary;
}

export type WithdrawalRow = {
  id: string;
  driver_id: string;
  amount_cents: number;
  status: string;
  pix_key: string;
  pix_key_type: string;
  holder_name: string;
  created_at: string;
  driver_name: string | null;
};

export async function listWithdrawals(db: SupabaseClient, status?: string): Promise<WithdrawalRow[]> {
  let query = db
    .from("withdrawals")
    .select("id, driver_id, amount_cents, status, pix_key, pix_key_type, holder_name, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (status) query = query.eq("status", status);

  const { data: withdrawals, error } = await query;
  if (error) throw new Error(`Falha ao listar saques: ${error.message}`);
  if (!withdrawals || withdrawals.length === 0) return [];

  const driverIds = [...new Set(withdrawals.map((w) => w.driver_id))];
  const { data: profiles } = await db.from("profiles").select("id, full_name").in("id", driverIds);
  const nameById = new Map((profiles ?? []).map((p) => [p.id as string, p.full_name as string | null]));

  return withdrawals.map((w) => ({ ...w, driver_name: nameById.get(w.driver_id) ?? null }));
}

const AUDIT_ACTIONS = {
  approveWithdrawal: "withdrawal.approve",
  failWithdrawal: "withdrawal.fail",
} as const;

async function logAdminAction(
  db: SupabaseClient,
  adminId: string,
  action: string,
  entityId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await db.from("audit_logs").insert({
    actor_id: adminId,
    actor_role: "admin",
    action,
    entity_type: "withdrawal",
    entity_id: entityId,
    new_value: metadata,
  });
}

export async function approveWithdrawal(
  db: SupabaseClient,
  withdrawalId: string,
  adminId: string,
  externalId?: string,
): Promise<void> {
  const { error } = await db.rpc("mark_withdrawal_paid", {
    p_withdrawal_id: withdrawalId,
    p_provider: "manual",
    p_external_id: externalId ?? null,
  });
  if (error) throw new Error(error.message);

  await logAdminAction(db, adminId, AUDIT_ACTIONS.approveWithdrawal, withdrawalId, { externalId: externalId ?? null });
}

export async function failWithdrawal(
  db: SupabaseClient,
  withdrawalId: string,
  adminId: string,
  reason: string,
): Promise<void> {
  const { error } = await db.rpc("fail_withdrawal", {
    p_withdrawal_id: withdrawalId,
    p_error_message: reason,
  });
  if (error) throw new Error(error.message);

  await logAdminAction(db, adminId, AUDIT_ACTIONS.failWithdrawal, withdrawalId, { reason });
}

export type AuditLogRow = {
  id: string;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_value: unknown;
  new_value: unknown;
  created_at: string;
};

export async function listAuditLogs(db: SupabaseClient, limit = 100): Promise<AuditLogRow[]> {
  const { data, error } = await db
    .from("audit_logs")
    .select("id, actor_id, actor_role, action, entity_type, entity_id, old_value, new_value, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Falha ao listar auditoria: ${error.message}`);
  return data ?? [];
}
