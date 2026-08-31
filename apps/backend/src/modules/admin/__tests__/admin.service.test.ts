import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  approveWithdrawal,
  failWithdrawal,
  getFinancialSummary,
  getSettingHistory,
  listAuditLogs,
  listSettings,
  listWithdrawals,
  SettingNotFoundError,
  updateSetting,
} from "../admin.service.js";

function thenable<T>(data: T, error: { message: string } | null = null) {
  return {
    then: (resolve: (v: { data: T; error: typeof error }) => void) => resolve({ data, error }),
    maybeSingle: async () => ({ data, error }),
    single: async () => ({ data, error }),
  };
}

describe("listSettings", () => {
  it("retorna as configurações ordenadas", async () => {
    const rows = [{ key: "a", value: 1, description: null, updated_at: "now", updated_by: null }];
    const db = {
      from: (table: string) => {
        if (table !== "platform_settings") throw new Error("tabela inesperada");
        return { select: () => ({ order: () => thenable(rows) }) };
      },
    } as unknown as SupabaseClient;

    expect(await listSettings(db)).toEqual(rows);
  });
});

describe("updateSetting", () => {
  it("atualiza o valor e passa updated_by", async () => {
    const captured: { payload?: unknown } = {};
    const db = {
      from: (table: string) => {
        if (table !== "platform_settings") throw new Error("tabela inesperada");
        return {
          update: (payload: unknown) => {
            captured.payload = payload;
            return { eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: { key: "a" }, error: null }) }) }) };
          },
        };
      },
    } as unknown as SupabaseClient;

    await updateSetting(db, "a", { foo: "bar" }, "admin-1");
    expect(captured.payload).toEqual({ value: { foo: "bar" }, updated_by: "admin-1" });
  });

  it("lança SettingNotFoundError quando a chave não existe", async () => {
    const db = {
      from: () => ({
        update: () => ({ eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
      }),
    } as unknown as SupabaseClient;

    await expect(updateSetting(db, "inexistente", 1, "admin-1")).rejects.toBeInstanceOf(SettingNotFoundError);
  });
});

describe("getSettingHistory", () => {
  it("retorna o histórico de uma chave", async () => {
    const rows = [{ id: "h1", old_value: 1, new_value: 2, changed_by: "admin-1", changed_at: "now" }];
    const db = {
      from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: () => thenable(rows) }) }) }) }),
    } as unknown as SupabaseClient;

    expect(await getSettingHistory(db, "a")).toEqual(rows);
  });
});

describe("getFinancialSummary", () => {
  it("chama a RPC admin_financial_summary e retorna o resultado", async () => {
    const summary = { delivered_orders_count: 1, gross_revenue_cents: 100 };
    const db = { rpc: () => thenable(summary) } as unknown as SupabaseClient;

    expect(await getFinancialSummary(db)).toEqual(summary);
  });
});

describe("listWithdrawals", () => {
  it("junta o nome do entregador a partir de profiles", async () => {
    const withdrawals = [
      { id: "w1", driver_id: "d1", amount_cents: 500, status: "REQUESTED", pix_key: "x", pix_key_type: "RANDOM", holder_name: "D", created_at: "now" },
    ];
    const db = {
      from: (table: string) => {
        if (table === "withdrawals") {
          return { select: () => ({ order: () => ({ limit: () => thenable(withdrawals) }) }) };
        }
        if (table === "profiles") {
          return { select: () => ({ in: () => thenable([{ id: "d1", full_name: "Driver One" }]) }) };
        }
        throw new Error("tabela inesperada");
      },
    } as unknown as SupabaseClient;

    const result = await listWithdrawals(db);
    expect(result).toEqual([{ ...withdrawals[0], driver_name: "Driver One" }]);
  });

  it("retorna lista vazia sem consultar profiles quando não há saques", async () => {
    const db = {
      from: (table: string) => {
        if (table === "withdrawals") return { select: () => ({ order: () => ({ limit: () => thenable([]) }) }) };
        throw new Error("não deveria consultar profiles sem saques");
      },
    } as unknown as SupabaseClient;

    expect(await listWithdrawals(db)).toEqual([]);
  });
});

describe("approveWithdrawal", () => {
  it("chama mark_withdrawal_paid e registra em audit_logs", async () => {
    const captured: { rpc?: { name: string; params: unknown }; audit?: unknown } = {};
    const db = {
      rpc: (name: string, params: unknown) => {
        captured.rpc = { name, params };
        return thenable(null);
      },
      from: (table: string) => {
        if (table !== "audit_logs") throw new Error("tabela inesperada");
        return {
          insert: async (payload: unknown) => {
            captured.audit = payload;
            return { data: null, error: null };
          },
        };
      },
    } as unknown as SupabaseClient;

    await approveWithdrawal(db, "w1", "admin-1", "ext-1");

    expect(captured.rpc).toEqual({
      name: "mark_withdrawal_paid",
      params: { p_withdrawal_id: "w1", p_provider: "manual", p_external_id: "ext-1" },
    });
    expect(captured.audit).toMatchObject({ actor_id: "admin-1", action: "withdrawal.approve", entity_id: "w1" });
  });

  it("propaga o erro da RPC sem registrar auditoria", async () => {
    const db = {
      rpc: () => thenable(null, { message: "WITHDRAWAL_NOT_FOUND_OR_INVALID_STATE" }),
      from: () => {
        throw new Error("não deveria registrar auditoria em caso de falha");
      },
    } as unknown as SupabaseClient;

    await expect(approveWithdrawal(db, "w1", "admin-1")).rejects.toThrow(/WITHDRAWAL_NOT_FOUND_OR_INVALID_STATE/);
  });
});

describe("failWithdrawal", () => {
  it("chama fail_withdrawal com o motivo e registra em audit_logs", async () => {
    const captured: { rpc?: { name: string; params: unknown } } = {};
    const db = {
      rpc: (name: string, params: unknown) => {
        captured.rpc = { name, params };
        return thenable(null);
      },
      from: () => ({ insert: async () => ({ data: null, error: null }) }),
    } as unknown as SupabaseClient;

    await failWithdrawal(db, "w1", "admin-1", "Chave PIX inválida");

    expect(captured.rpc).toEqual({
      name: "fail_withdrawal",
      params: { p_withdrawal_id: "w1", p_error_message: "Chave PIX inválida" },
    });
  });
});

describe("listAuditLogs", () => {
  it("retorna os logs mais recentes primeiro", async () => {
    const rows = [{ id: "l1", actor_id: "a", actor_role: "admin", action: "x", entity_type: "y", entity_id: null, old_value: null, new_value: null, created_at: "now" }];
    const db = {
      from: () => ({ select: () => ({ order: () => ({ limit: () => thenable(rows) }) }) }),
    } as unknown as SupabaseClient;

    expect(await listAuditLogs(db)).toEqual(rows);
  });
});
