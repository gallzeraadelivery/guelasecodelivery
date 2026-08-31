import { Stack } from "expo-router";
import { SessionProvider } from "../src/context/session";
import { CartProvider } from "../src/context/cart";

export default function RootLayout() {
  return (
    <SessionProvider>
      <CartProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="login" />
          <Stack.Screen name="signup" />
          <Stack.Screen name="address" options={{ headerShown: true, title: "Endereço de entrega" }} />
          <Stack.Screen name="(tabs)" />
        </Stack>
      </CartProvider>
    </SessionProvider>
  );
}
