"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAdminSession } from "@/context/session";
import {
  BackendError,
  closeSupportTicket,
  getSupportMessages,
  listSupportTickets,
  sendSupportMessage,
  type SupportMessage,
  type SupportTicket,
} from "@/lib/backend";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR");
}

export default function SuportePage() {
  const { session } = useAdminSession();
  const [statusFilter, setStatusFilter] = useState<"OPEN" | "CLOSED">("OPEN");
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadTickets = useCallback(async () => {
    if (!session) return;
    const next = await listSupportTickets(session.access_token, statusFilter);
    setTickets(next);
    setLoading(false);
  }, [session, statusFilter]);

  useEffect(() => {
    void loadTickets();
    const interval = setInterval(() => void loadTickets(), 8000);
    return () => clearInterval(interval);
  }, [loadTickets]);

  const loadMessages = useCallback(async () => {
    if (!session || !selectedId) return;
    const next = await getSupportMessages(session.access_token, selectedId);
    setMessages(next);
  }, [session, selectedId]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  // Atualização quase em tempo real via polling — o admin não lê o Supabase
  // direto (decisão já existente no projeto), então em vez de Realtime a
  // caixa de chamados atualiza sozinha a cada 3s enquanto um chamado está
  // aberto na tela.
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!selectedId) return;
    pollRef.current = setInterval(() => void loadMessages(), 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [selectedId, loadMessages]);

  async function handleSend() {
    if (!session || !selectedId || !reply.trim()) return;
    setSending(true);
    try {
      await sendSupportMessage(session.access_token, selectedId, reply.trim());
      setReply("");
      await loadMessages();
    } catch (err) {
      alert(err instanceof BackendError ? err.message : "Falha ao enviar mensagem.");
    } finally {
      setSending(false);
    }
  }

  async function handleClose() {
    if (!session || !selectedId) return;
    if (!confirm("Fechar este chamado?")) return;
    try {
      await closeSupportTicket(session.access_token, selectedId);
      setSelectedId(null);
      await loadTickets();
    } catch (err) {
      alert(err instanceof BackendError ? err.message : "Falha ao fechar chamado.");
    }
  }

  const selectedTicket = tickets.find((t) => t.id === selectedId) ?? null;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Suporte</h2>

      <div className="flex gap-2">
        {(["OPEN", "CLOSED"] as const).map((s) => (
          <button
            key={s}
            onClick={() => {
              setStatusFilter(s);
              setSelectedId(null);
            }}
            className={`rounded px-3 py-1 text-xs font-medium ${
              statusFilter === s
                ? "bg-brand-red text-white"
                : "border border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
            }`}
          >
            {s === "OPEN" ? "Abertos" : "Fechados"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-1 rounded-lg border border-zinc-200 dark:border-zinc-800">
          {loading ? (
            <p className="p-4 text-sm text-zinc-500">Carregando...</p>
          ) : tickets.length === 0 ? (
            <p className="p-4 text-sm text-zinc-500">Nenhum chamado {statusFilter === "OPEN" ? "aberto" : "fechado"}.</p>
          ) : (
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {tickets.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => setSelectedId(t.id)}
                    className={`block w-full p-3 text-left text-sm ${
                      selectedId === t.id ? "bg-zinc-100 dark:bg-zinc-900" : "hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                    }`}
                  >
                    <p className="font-medium text-black dark:text-zinc-50">{t.subject}</p>
                    <p className="text-xs text-zinc-500">{t.customer_name ?? t.customer_id}</p>
                    <p className="text-xs text-zinc-400">{formatDate(t.updated_at)}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="col-span-2 flex flex-col rounded-lg border border-zinc-200 dark:border-zinc-800">
          {!selectedTicket ? (
            <p className="p-4 text-sm text-zinc-500">Selecione um chamado.</p>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-zinc-200 p-3 dark:border-zinc-800">
                <div>
                  <p className="font-medium text-black dark:text-zinc-50">{selectedTicket.subject}</p>
                  <p className="text-xs text-zinc-500">{selectedTicket.customer_name ?? selectedTicket.customer_id}</p>
                </div>
                {selectedTicket.status === "OPEN" && (
                  <button
                    onClick={handleClose}
                    className="rounded border border-red-600 px-2 py-1 text-xs font-medium text-red-600"
                  >
                    Fechar chamado
                  </button>
                )}
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto p-3" style={{ maxHeight: 420, minHeight: 200 }}>
                {messages.map((m) => (
                  <div key={m.id} className={`flex ${m.sender_role === "admin" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                        m.sender_role === "admin"
                          ? "bg-brand-red text-white"
                          : "bg-zinc-100 text-black dark:bg-zinc-800 dark:text-zinc-50"
                      }`}
                    >
                      {m.body}
                    </div>
                  </div>
                ))}
              </div>

              {selectedTicket.status === "OPEN" && (
                <div className="flex gap-2 border-t border-zinc-200 p-3 dark:border-zinc-800">
                  <input
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                    placeholder="Responder..."
                    className="flex-1 rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  />
                  <button
                    onClick={handleSend}
                    disabled={sending || !reply.trim()}
                    className="rounded bg-brand-red px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Enviar
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
