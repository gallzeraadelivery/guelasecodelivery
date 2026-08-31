"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type SessionContextValue = {
  session: Session | null;
  loading: boolean;
};

const SessionContext = createContext<SessionContextValue>({ session: null, loading: true });

/**
 * Só gate de autenticação — a verificação de profiles.role = 'admin' já
 * aconteceu no login (que desloga quem não é admin), e toda leitura/escrita
 * sensível é revalidada pelo backend via requireAdminId a cada chamada.
 */
export function AdminSessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/login");
        return;
      }
      setSession(data.session);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) router.replace("/login");
    });

    return () => subscription.subscription.unsubscribe();
  }, [router]);

  return <SessionContext.Provider value={{ session, loading }}>{children}</SessionContext.Provider>;
}

export function useAdminSession() {
  return useContext(SessionContext);
}
