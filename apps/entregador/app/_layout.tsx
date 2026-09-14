import { Stack } from "expo-router";
import { SessionProvider } from "../src/context/session";

export default function RootLayout() {
  return (
    <SessionProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="signup" />
        <Stack.Screen name="profile/personal" options={{ headerShown: true, title: "Dados pessoais" }} />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </SessionProvider>
  );
}
