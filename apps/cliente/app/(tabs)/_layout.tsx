import { Tabs } from "expo-router";
import { useCart } from "../../src/context/cart";
import { colors } from "../../src/theme/colors";

export default function TabsLayout() {
  const { totalItems } = useCart();

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
      <Tabs.Screen name="catalog" options={{ title: "Catálogo" }} />
      <Tabs.Screen
        name="cart"
        options={{ title: totalItems > 0 ? `Carrinho (${totalItems})` : "Carrinho" }}
      />
      <Tabs.Screen name="orders" options={{ title: "Pedidos" }} />
      <Tabs.Screen name="profile" options={{ title: "Perfil" }} />
    </Tabs>
  );
}
