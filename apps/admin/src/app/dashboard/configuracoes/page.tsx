"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminSession } from "@/context/session";
import {
  BackendError,
  getSettingHistory,
  listSettings,
  updateSetting,
  type PlatformSetting,
  type SettingHistoryEntry,
} from "@/lib/backend";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR");
}

export default function SettingsPage() {
  const { session } = useAdminSession();
  const [settings, setSettings] = useState<PlatformSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [historyKey, setHistoryKey] = useState<string | null>(null);
  const [history, setHistory] = useState<SettingHistoryEntry[]>([]);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      setSettings(await listSettings(session.access_token));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  function startEditing(setting: PlatformSetting) {
    setEditingKey(setting.key);
    setDraftValue(JSON.stringify(setting.value, null, 2));
    setDraftError(null);
  }

  async function handleSave(key: string) {
    if (!session) return;
    setDraftError(null);

    let parsedValue: unknown;
    try {
      parsedValue = JSON.parse(draftValue);
    } catch {
      setDraftError("JSON inválido.");
      return;
    }

    setSaving(true);
    try {
      await updateSetting(session.access_token, key, parsedValue);
      setEditingKey(null);
      await load();
    } catch (err) {
      setDraftError(err instanceof BackendError ? err.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleShowHistory(key: string) {
    if (!session) return;
    setHistoryKey(key);
    setHistory(await getSettingHistory(session.access_token, key));
  }

  if (loading) return <p className="text-sm text-zinc-600 dark:text-zinc-400">Carregando...</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Configurações</h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Valores lidos em tempo real pela plataforma — nunca hardcoded. Alterar aqui não muda pedidos/pagamentos já
        registrados (cada um guarda seu próprio snapshot).
      </p>

      <div className="space-y-3">
        {settings.map((setting) => (
          <div key={setting.key} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-sm font-semibold text-black dark:text-zinc-50">{setting.key}</p>
                {setting.description && (
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{setting.description}</p>
                )}
              </div>
              <div className="flex shrink-0 gap-2 text-xs">
                <button onClick={() => handleShowHistory(setting.key)} className="text-zinc-600 hover:underline dark:text-zinc-400">
                  Histórico
                </button>
                {editingKey !== setting.key && (
                  <button onClick={() => startEditing(setting)} className="text-black hover:underline dark:text-zinc-50">
                    Editar
                  </button>
                )}
              </div>
            </div>

            {editingKey === setting.key ? (
              <div className="mt-3 space-y-2">
                <textarea
                  value={draftValue}
                  onChange={(event) => setDraftValue(event.target.value)}
                  rows={6}
                  className="w-full rounded border border-zinc-300 bg-white p-2 font-mono text-xs text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                />
                {draftError && <p className="text-xs text-red-600">{draftError}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSave(setting.key)}
                    disabled={saving}
                    className="rounded bg-black px-3 py-1 text-xs font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
                  >
                    {saving ? "Salvando..." : "Salvar"}
                  </button>
                  <button onClick={() => setEditingKey(null)} className="text-xs text-zinc-600 dark:text-zinc-400">
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <pre className="mt-3 overflow-x-auto rounded bg-zinc-100 p-2 text-xs text-black dark:bg-zinc-900 dark:text-zinc-50">
                {JSON.stringify(setting.value, null, 2)}
              </pre>
            )}

            {historyKey === setting.key && (
              <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                <p className="mb-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400">Histórico de alterações</p>
                {history.length === 0 ? (
                  <p className="text-xs text-zinc-500">Nenhuma alteração registrada.</p>
                ) : (
                  <ul className="space-y-1">
                    {history.map((entry) => (
                      <li key={entry.id} className="text-xs text-zinc-600 dark:text-zinc-400">
                        {formatDate(entry.changed_at)}: {JSON.stringify(entry.old_value)} → {JSON.stringify(entry.new_value)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
