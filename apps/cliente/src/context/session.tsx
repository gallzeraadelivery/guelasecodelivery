import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Platform } from "react-native";
import type { Session } from "@supabase/supabase-js";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { supabase } from "../lib/supabase";

type SessionContextValue = {
  session: Session | null;
  loading: boolean;
};

const SessionContext = createContext<SessionContextValue>({ session: null, loading: true });

/**
 * Best-effort, igual ao entregador (seção 27): se falhar (permissão negada,
 * push ainda sem credenciais), o app continua funcionando normalmente, só
 * fica sem notificação.
 */
async function registerPushToken(userId: string) {
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.HIGH,
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const pushToken = await Notifications.getExpoPushTokenAsync({ projectId });

    await supabase.from("customers").update({ push_token: pushToken.data }).eq("id", userId);
  } catch (error) {
    console.warn("[push] falha ao registrar token:", error);
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const registeredUserId = useRef<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session && registeredUserId.current !== session.user.id) {
      registeredUserId.current = session.user.id;
      void registerPushToken(session.user.id);
    }
  }, [session]);

  return <SessionContext.Provider value={{ session, loading }}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}
