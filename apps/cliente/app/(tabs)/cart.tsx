import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useCart } from "../../src/context/cart";

function formatCents(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2)}`;
}

export default function CartScreen() {
  const { items, setQuantity, removeItem } = useCart();

  const indicativeTotalCents = items.reduce(
    (sum, item) => sum + (item.indicativePriceCents ?? 0) * item.quantity,
    0,
  );

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
            Valor indicativo — a distribuidora, o frete e o total final são definidos no checkout.
          </Text>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total estimado</Text>
            <Text style={styles.totalValue}>{formatCents(indicativeTotalCents)}</Text>
          </View>
          <Pressable style={styles.checkoutButton} disabled>
            <Text style={styles.checkoutButtonText}>Finalizar pedido (em breve)</Text>
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
    backgroundColor: "#ccc",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  checkoutButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
});
