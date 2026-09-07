import { Tabs } from "expo-router";
import { colors } from "../../src/theme/colors";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.red },
        headerTitleStyle: { color: colors.yellow, fontWeight: "700" },
        headerTintColor: colors.yellow,
        tabBarActiveTintColor: colors.red,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tabs.Screen name="status" options={{ title: "Status" }} />
      <Tabs.Screen name="wallet" options={{ title: "Carteira" }} />
      <Tabs.Screen name="profile" options={{ title: "Perfil" }} />
    </Tabs>
  );
}
