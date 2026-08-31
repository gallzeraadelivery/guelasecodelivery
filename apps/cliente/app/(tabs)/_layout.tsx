import { Tabs } from "expo-router";
import { useCart } from "../../src/context/cart";

export default function TabsLayout() {
  const { totalItems } = useCart();

  return (
    <Tabs screenOptions={{ headerShown: true }}>
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
