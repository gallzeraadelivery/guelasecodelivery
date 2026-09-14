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
  settlePartnerSettlement: "partner_settlement.settle",
} as const;

async function logAdminAction(
  db: SupabaseClient,
  adminId: string,
  action: string,
  entityId: string,
  metadata: Record<string, unknown>,
  entityType = "withdrawal",
): Promise<void> {
  await db.from("audit_logs").insert({
    actor_id: adminId,
    actor_role: "admin",
    action,
    entity_type: entityType,
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

export type PartnerSettlementRow = {
  id: string;
  partner_id: string;
  order_id: string;
  amount_cents: number;
  status: string;
  created_at: string;
  settled_at: string | null;
  partner_trade_name: string | null;
};

/**
 * Valores que distribuidoras têm a receber de pedidos pagos em dinheiro na
 * entrega (o dinheiro em si já está com o entregador — isto é só o "quanto
 * devemos repassar pra cada distribuidora"). Acerto feito fora do app
 * (transferência bancária) e marcado aqui manualmente pelo admin.
 */
export async function listPartnerSettlements(
  db: SupabaseClient,
  status?: string,
): Promise<PartnerSettlementRow[]> {
  let query = db
    .from("partner_settlements")
    .select("id, partner_id, order_id, amount_cents, status, created_at, settled_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (status) query = query.eq("status", status);

  const { data: settlements, error } = await query;
  if (error) throw new Error(`Falha ao listar repasses: ${error.message}`);
  if (!settlements || settlements.length === 0) return [];

  const partnerIds = [...new Set(settlements.map((s) => s.partner_id))];
  const { data: partners } = await db.from("partners").select("id, trade_name").in("id", partnerIds);
  const nameById = new Map((partners ?? []).map((p) => [p.id as string, p.trade_name as string | null]));

  return settlements.map((s) => ({ ...s, partner_trade_name: nameById.get(s.partner_id) ?? null }));
}

export class SettlementNotFoundError extends Error {}

export async function settlePartnerSettlement(
  db: SupabaseClient,
  settlementId: string,
  adminId: string,
): Promise<void> {
  const { data, error } = await db
    .from("partner_settlements")
    .update({ status: "SETTLED", settled_at: new Date().toISOString(), settled_by: adminId })
    .eq("id", settlementId)
    .eq("status", "PENDING")
    .select("id")
    .maybeSingle();

  if (error) throw new Error(`Falha ao marcar repasse como pago: ${error.message}`);
  if (!data) throw new SettlementNotFoundError("Repasse não encontrado ou já marcado como pago.");

  await logAdminAction(db, adminId, AUDIT_ACTIONS.settlePartnerSettlement, settlementId, {}, "partner_settlement");
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

export type SupportTicketRow = {
  id: string;
  customer_id: string;
  order_id: string | null;
  subject: string;
  status: string;
  created_at: string;
  updated_at: string;
  customer_name: string | null;
};

export async function listSupportTickets(db: SupabaseClient, status?: string): Promise<SupportTicketRow[]> {
  let query = db
    .from("support_tickets")
    .select("id, customer_id, order_id, subject, status, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(200);

  if (status) query = query.eq("status", status);

  const { data: tickets, error } = await query;
  if (error) throw new Error(`Falha ao listar chamados: ${error.message}`);
  if (!tickets || tickets.length === 0) return [];

  const customerIds = [...new Set(tickets.map((t) => t.customer_id))];
  const { data: profiles } = await db.from("profiles").select("id, full_name").in("id", customerIds);
  const nameById = new Map((profiles ?? []).map((p) => [p.id as string, p.full_name as string | null]));

  return tickets.map((t) => ({ ...t, customer_name: nameById.get(t.customer_id) ?? null }));
}

export type SupportMessageRow = {
  id: string;
  ticket_id: string;
  sender_role: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export class SupportTicketNotFoundError extends Error {}

export async function getSupportMessages(db: SupabaseClient, ticketId: string): Promise<SupportMessageRow[]> {
  const { data, error } = await db
    .from("support_messages")
    .select("id, ticket_id, sender_role, sender_id, body, created_at")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Falha ao buscar mensagens: ${error.message}`);
  return data ?? [];
}

export async function sendSupportMessageAsAdmin(
  db: SupabaseClient,
  ticketId: string,
  adminId: string,
  body: string,
): Promise<void> {
  const { data: ticket } = await db.from("support_tickets").select("id").eq("id", ticketId).maybeSingle();
  if (!ticket) throw new SupportTicketNotFoundError("Chamado não encontrado.");

  const { error } = await db
    .from("support_messages")
    .insert({ ticket_id: ticketId, sender_role: "admin", sender_id: adminId, body });
  if (error) throw new Error(`Falha ao enviar mensagem: ${error.message}`);

  await db.from("support_tickets").update({ updated_at: new Date().toISOString() }).eq("id", ticketId);
}

export async function closeSupportTicket(db: SupabaseClient, ticketId: string): Promise<void> {
  const { data, error } = await db
    .from("support_tickets")
    .update({ status: "CLOSED" })
    .eq("id", ticketId)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(`Falha ao fechar chamado: ${error.message}`);
  if (!data) throw new SupportTicketNotFoundError("Chamado não encontrado.");
}
