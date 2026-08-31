import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { supabase } from "../../src/lib/supabase";

type OrderRow = {
  id: string;
  status: string;
  total_cents: number | null;
  created_at: string;
  partners: { trade_name: string } | null;
};

const STATUS_LABELS: Record<string, string> = {
  CREATED: "Criado",
  FULFILLMENT_SELECTED: "Selecionando distribuidora",
  STOCK_RESERVED: "Estoque reservado",
  AWAITING_PAYMENT: "Aguardando pagamento",
  PAID: "Pagamento confirmado",
  PARTNER_CONFIRMATION: "Aguardando confirmação da distribuidora",
  ACCEPTED: "Distribuidora aceitou",
  PREPARING: "Em preparo",
  READY_FOR_PICKUP: "Pronto para retirada",
  SEARCHING_DRIVER: "Buscando entregador",
  DRIVER_ASSIGNED: "Entregador a caminho da retirada",
  DRIVER_TO_PICKUP: "Entregador a caminho da retirada",
  PICKED_UP: "Pedido retirado",
  IN_DELIVERY: "A caminho de você",
  DELIVERED: "Entregue",
  CANCELLED: "Cancelado",
  REFUNDED: "Reembolsado",
  PAYMENT_FAILED: "Pagamento falhou",
  DISPUTED: "Em disputa",
  EXPIRED: "Expirado",
};

function formatCents(cents: number | null): string {
  if (cents === null) return "—";
  return `R$ ${(cents / 100).toFixed(2)}`;
}

export default function OrdersScreen() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadOrders = useCallback(() => {
    supabase
      .from("orders")
      .select("id, status, total_cents, created_at, partners(trade_name)")
      .order("created_at", { ascending: false })
      .returns<OrderRow[]>()
      .then(({ data }) => {
        setOrders(data ?? []);
        setLoading(false);
      });
  }, []);

  useFocusEffect(loadOrders);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.list}
      data={orders}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={false} onRefresh={loadOrders} />}
      ListEmptyComponent={<Text style={styles.empty}>Você ainda não fez nenhum pedido.</Text>}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.partnerName}>{item.partners?.trade_name ?? "Guela Seco"}</Text>
          <Text style={styles.status}>{STATUS_LABELS[item.status] ?? item.status}</Text>
          <Text style={styles.total}>{formatCents(item.total_cents)}</Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  list: {
    padding: 16,
    gap: 8,
  },
  empty: {
    textAlign: "center",
    color: "#666",
    marginTop: 24,
  },
  card: {
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  partnerName: {
    fontSize: 15,
    fontWeight: "600",
  },
  status: {
    fontSize: 13,
    color: "#666",
  },
  total: {
    fontSize: 14,
    fontWeight: "600",
    marginTop: 4,
  },
});
