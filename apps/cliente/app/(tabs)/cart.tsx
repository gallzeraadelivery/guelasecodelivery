import { useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useCart } from "../../src/context/cart";
import { supabase } from "../../src/lib/supabase";
import { BackendError, createCheckout, createOrder } from "../../src/lib/backend";

function formatCents(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2)}`;
}

export default function CartScreen() {
  const { items, setQuantity, removeItem, clear } = useCart();
  const [placingOrder, setPlacingOrder] = useState(false);

  const indicativeTotalCents = items.reduce(
    (sum, item) => sum + (item.indicativePriceCents ?? 0) * item.quantity,
    0,
  );

  async function handleCheckout() {
    setPlacingOrder(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        Alert.alert("Faça login", "Você precisa estar logado para finalizar o pedido.");
        return;
      }

      const { data: addresses } = await supabase
        .from("addresses")
        .select("id")
        .order("is_default", { ascending: false })
        .limit(1);

      const addressId = addresses?.[0]?.id;
      if (!addressId) {
        Alert.alert("Endereço necessário", "Adicione um endereço de entrega antes de continuar.", [
          { text: "Adicionar endereço", onPress: () => router.push("/address") },
          { text: "Cancelar", style: "cancel" },
        ]);
        return;
      }

      const result = await createOrder(
        session.access_token,
        addressId,
        items.map((item) => ({ catalogProductId: item.catalogProductId, quantity: item.quantity })),
      );

      clear();

      let checkout;
      try {
        checkout = await createCheckout(session.access_token, result.orderId);
      } catch (checkoutError) {
        const message =
          checkoutError instanceof BackendError && checkoutError.status === 409
            ? checkoutError.message
            : "Não foi possível iniciar o pagamento agora. Você pode tentar novamente em breve.";
        Alert.alert(
          `Pedido criado — ${result.partner.tradeName}`,
          `Chega em aproximadamente ${result.etaMinutes} min · Total: ${formatCents(result.totalCents)}\n\n${message}`,
        );
        return;
      }

      await WebBrowser.openBrowserAsync(checkout.checkoutUrl);
      Alert.alert(
        "Pagamento",
        "Se você concluiu o pagamento, seu pedido será confirmado em instantes.",
      );
    } catch (error) {
      if (error instanceof BackendError && error.status === 422) {
        Alert.alert("Sem cobertura", error.message);
      } else {
        Alert.alert("Não foi possível finalizar", "Tente novamente em instantes.");
      }
    } finally {
      setPlacingOrder(false);
    }
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.catalogProductId}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>Seu carrinho está vazio.</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowInfo}>
              <Text style={styles.name}>{item.name}</Text>
              {item.indicativePriceCents !== null && (
                <Text style={styles.price}>{formatCents(item.indicativePriceCents)} un.</Text>
              )}
            </View>
            <View style={styles.quantityControls}>
              <Pressable
                style={styles.quantityButton}
                onPress={() => setQuantity(item.catalogProductId, item.quantity - 1)}
              >
                <Text style={styles.quantityButtonText}>−</Text>
              </Pressable>
              <Text style={styles.quantity}>{item.quantity}</Text>
              <Pressable
                style={styles.quantityButton}
                onPress={() => setQuantity(item.catalogProductId, item.quantity + 1)}
              >
                <Text style={styles.quantityButtonText}>+</Text>
              </Pressable>
            </View>
            <Pressable onPress={() => removeItem(item.catalogProductId)}>
              <Text style={styles.remove}>Remover</Text>
            </Pressable>
          </View>
        )}
      />

      {items.length > 0 && (
        <View style={styles.footer}>
          <Text style={styles.footerNote}>
            Valor indicativo — a distribuidora, o frete e a taxa de serviço são confirmados ao
            finalizar o pedido.
          </Text>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total estimado</Text>
            <Text style={styles.totalValue}>{formatCents(indicativeTotalCents)}</Text>
          </View>
          <Pressable style={styles.checkoutButton} onPress={handleCheckout} disabled={placingOrder}>
            {placingOrder ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.checkoutButtonText}>Finalizar pedido</Text>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 16,
  },
  list: {
    gap: 8,
  },
  empty: {
    textAlign: "center",
    color: "#666",
    marginTop: 24,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 10,
    padding: 12,
    gap: 12,
  },
  rowInfo: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 15,
    fontWeight: "600",
  },
  price: {
    fontSize: 13,
    color: "#666",
  },
  quantityControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  quantityButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#ccc",
    alignItems: "center",
    justifyContent: "center",
  },
  quantityButtonText: {
    fontSize: 16,
  },
  quantity: {
    minWidth: 20,
    textAlign: "center",
  },
  remove: {
    fontSize: 12,
    color: "#c00",
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: "#eee",
    paddingTop: 12,
    gap: 8,
  },
  footerNote: {
    fontSize: 12,
    color: "#999",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: "600",
  },
  totalValue: {
    fontSize: 16,
    fontWeight: "700",
  },
  checkoutButton: {
    backgroundColor: "#000",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  checkoutButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
});
