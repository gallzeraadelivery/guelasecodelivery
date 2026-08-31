"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminSession } from "@/context/session";
import { listAuditLogs, type AuditLogEntry } from "@/lib/backend";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR");
}

export default function AuditoriaPage() {
  const { session } = useAdminSession();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      setLogs(await listAuditLogs(session.access_token));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <p className="text-sm text-zinc-600 dark:text-zinc-400">Carregando...</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Auditoria</h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Registro imutável de ações administrativas e operações sensíveis da plataforma.
      </p>

      {logs.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Nenhum registro ainda.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-100 text-left text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                <th className="p-3">Quando</th>
                <th className="p-3">Ação</th>
                <th className="p-3">Entidade</th>
                <th className="p-3">Ator</th>
                <th className="p-3">Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-t border-zinc-200 align-top dark:border-zinc-800">
                  <td className="whitespace-nowrap p-3 text-xs text-zinc-500">{formatDate(log.created_at)}</td>
                  <td className="p-3 font-mono text-xs">{log.action}</td>
                  <td className="p-3 text-xs">
                    {log.entity_type}
                    {log.entity_id ? ` #${log.entity_id.slice(0, 8)}` : ""}
                  </td>
                  <td className="p-3 text-xs">{log.actor_role ?? "—"}</td>
                  <td className="p-3">
                    <pre className="max-w-xs overflow-x-auto text-xs text-zinc-600 dark:text-zinc-400">
                      {JSON.stringify(log.new_value ?? log.old_value ?? {}, null, 0)}
                    </pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
