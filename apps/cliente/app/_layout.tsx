import { useEffect, useRef } from "react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { SessionProvider, useSession } from "../src/context/session";
import { CartProvider } from "../src/context/cart";

SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ duration: 400, fade: true });

// Segura a splash por pelo menos esse tempo mesmo se a sessão resolver rápido
// — sem isso, num carregamento rápido a logo só pisca na tela.
const MIN_SPLASH_MS = 900;

function AppShell() {
  const { loading } = useSession();
  const shownAt = useRef<number | null>(null);

  useEffect(() => {
    shownAt.current = Date.now();
  }, []);

  useEffect(() => {
    if (loading) return;
    const remaining = Math.max(0, MIN_SPLASH_MS - (Date.now() - (shownAt.current ?? Date.now())));
    const timer = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
    }, remaining);
    return () => clearTimeout(timer);
  }, [loading]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="address" options={{ headerShown: true, title: "Endereço de entrega" }} />
      <Stack.Screen name="checkout" options={{ headerShown: true, title: "Pagamento" }} />
      <Stack.Screen name="order/[id]" options={{ headerShown: true, title: "Pedido" }} />
      <Stack.Screen name="support" options={{ headerShown: true, title: "Suporte" }} />
      <Stack.Screen name="support/[id]" options={{ headerShown: true, title: "Chamado" }} />
      <Stack.Screen name="profile/personal" options={{ headerShown: true, title: "Dados pessoais" }} />
      <Stack.Screen name="profile/addresses" options={{ headerShown: true, title: "Meus endereços" }} />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <CartProvider>
        <AppShell />
      </CartProvider>
    </SessionProvider>
  );
}
