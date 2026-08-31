const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3333";

export class BackendError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function adminFetch<T>(
  accessToken: string,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const response = await fetch(`${backendUrl}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  const body = await response.json();

  if (!response.ok) {
    throw new BackendError(body.error ?? "Falha na requisição.", response.status);
  }

  return body as T;
}

export type PlatformSetting = {
  key: string;
  value: unknown;
  description: string | null;
  updated_at: string;
  updated_by: string | null;
};

export const listSettings = (token: string) =>
  adminFetch<{ settings: PlatformSetting[] }>(token, "/admin/settings").then((r) => r.settings);

export const updateSetting = (token: string, key: string, value: unknown) =>
  adminFetch<{ status: string }>(token, `/admin/settings/${encodeURIComponent(key)}`, { method: "PATCH", body: { value } });

export type SettingHistoryEntry = {
  id: string;
  old_value: unknown;
  new_value: unknown;
  changed_by: string | null;
  changed_at: string;
};

export const getSettingHistory = (token: string, key: string) =>
  adminFetch<{ history: SettingHistoryEntry[] }>(token, `/admin/settings/${encodeURIComponent(key)}/history`).then(
    (r) => r.history,
  );

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

export const getFinancialSummary = (token: string) =>
  adminFetch<FinancialSummary>(token, "/admin/financeiro/summary");

export type Withdrawal = {
  id: string;
  driver_id: string;
  driver_name: string | null;
  amount_cents: number;
  status: string;
  pix_key: string;
  pix_key_type: string;
  holder_name: string;
  created_at: string;
};

export const listWithdrawals = (token: string, status?: string) =>
  adminFetch<{ withdrawals: Withdrawal[] }>(
    token,
    `/admin/withdrawals${status ? `?status=${encodeURIComponent(status)}` : ""}`,
  ).then((r) => r.withdrawals);

export const approveWithdrawal = (token: string, id: string, externalId?: string) =>
  adminFetch<{ status: string }>(token, `/admin/withdrawals/${id}/approve`, { method: "POST", body: { externalId } });

export const failWithdrawal = (token: string, id: string, reason: string) =>
  adminFetch<{ status: string }>(token, `/admin/withdrawals/${id}/fail`, { method: "POST", body: { reason } });

export type AuditLogEntry = {
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

export const listAuditLogs = (token: string) =>
  adminFetch<{ logs: AuditLogEntry[] }>(token, "/admin/audit").then((r) => r.logs);

export type AntifraudeFlags = {
  kyc: { driverId: string; driverName: string | null; kycStatus: string }[];
  disputedOrders: { orderId: string; customerName: string | null; partnerName: string | null; totalCents: number | null; createdAt: string }[];
  repeatedPaymentFailures: { customerId: string; customerName: string | null; failureCount: number }[];
};

export const getAntifraudeFlags = (token: string) =>
  adminFetch<AntifraudeFlags>(token, "/admin/antifraude/flags");
