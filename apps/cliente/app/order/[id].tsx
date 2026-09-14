import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSession } from "../../src/context/session";
import { supabase } from "../../src/lib/supabase";
import { BackendError, cancelOrder, getOrderDetails, type OrderDetails } from "../../src/lib/backend";
import { STATUS_LABELS } from "../../src/lib/orderStatus";
import { colors } from "../../src/theme/colors";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  ONLINE: "Pago online",
  CASH_ON_DELIVERY: "Dinheiro na entrega",
};

function formatCents(cents: number | null): string {
  if (cents === null) return "—";
  return `R$ ${(cents / 100).toFixed(2)}`;
}

function openWhatsApp(phone: string, message: string) {
  const digits = phone.replace(/\D+/g, "");
  Linking.openURL(`https://wa.me/${digits}?text=${encodeURIComponent(message)}`).catch(() => {
    Alert.alert("Não foi possível abrir o WhatsApp", "Verifique se o WhatsApp está instalado.");
  });
}

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();

  const [details, setDetails] = useState<OrderDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(() => {
    if (!session || !id) return;
    getOrderDetails(session.access_token, id)
      .then(setDetails)
      .catch(() => {
        Alert.alert("Não foi possível carregar o pedido", "Tente novamente em instantes.");
      })
      .finally(() => setLoading(false));
  }, [session, id]);

  useFocusEffect(load);

  async function handleCancel() {
    if (!session || !id) return;
    Alert.alert("Cancelar pedido", "Tem certeza que deseja cancelar este pedido?", [
      { text: "Não", style: "cancel" },
      {
        text: "Sim, cancelar",
        style: "destructive",
        onPress: async () => {
          setCancelling(true);
          try {
            await cancelOrder(session.access_token, id);
            load();
            Alert.alert("Pedido cancelado", "Seu pedido foi cancelado.");
          } catch (error) {
            Alert.alert(
              "Não foi possível cancelar",
              error instanceof BackendError ? error.message : "Tente novamente.",
            );
          } finally {
            setCancelling(false);
          }
        },
      },
    ]);
  }

  async function handleContactSupport() {
    if (!session || !id) return;

    const { data: existing } = await supabase
      .from("support_tickets")
      .select("id")
      .eq("order_id", id)
      .eq("status", "OPEN")
      .maybeSingle();

    if (existing) {
      router.push(`/support/${existing.id}`);
      return;
    }

    const { data, error } = await supabase
      .from("support_tickets")
      .insert({ customer_id: session.user.id, order_id: id, subject: `Pedido ${id.slice(0, 8)}` })
      .select("id")
      .single();

    if (error || !data) {
      Alert.alert("Não foi possível abrir o chamado", "Tente novamente em instantes.");
      return;
    }

    router.push(`/support/${data.id}`);
  }

  if (loading || !details) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.red} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.section}>
        <Text style={styles.partnerName}>{details.partner?.tradeName ?? "Guela Seco"}</Text>
        {details.partner?.addressLine && <Text style={styles.muted}>{details.partner.addressLine}</Text>}
        {details.etaMinutes !== null && (
          <Text style={styles.muted}>Tempo estimado: ~{Math.round(details.etaMinutes)} min</Text>
        )}
        <Text style={styles.statusBadge}>{STATUS_LABELS[details.status] ?? details.status}</Text>
        {details.status === "CANCELLED" && details.cancellationReason && (
          <View style={styles.cancellationBox}>
            <Text style={styles.cancellationLabel}>Motivo do cancelamento</Text>
            <Text style={styles.cancellationText}>{details.cancellationReason}</Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Itens</Text>
        {details.items.map((item, index) => (
          <View key={index} style={styles.itemRow}>
            <Text style={styles.itemName}>
              {item.quantity}x {item.name}
            </Text>
            <Text style={styles.itemPrice}>
              {item.unitPriceCents !== null ? formatCents(item.unitPriceCents * item.quantity) : "—"}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <View style={styles.totalRow}>
          <Text style={styles.muted}>Subtotal</Text>
          <Text>{formatCents(details.subtotalCents)}</Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.muted}>Taxa de serviço</Text>
          <Text>{formatCents(details.serviceFeeCents)}</Text>
        </View>
        {details.deliveryFeeCents !== null && (
          <View style={styles.totalRow}>
            <Text style={styles.muted}>Frete</Text>
            <Text>{formatCents(details.deliveryFeeCents)}</Text>
          </View>
        )}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatCents(details.totalCents)}</Text>
        </View>
        <Text style={styles.muted}>{PAYMENT_METHOD_LABELS[details.paymentMethod] ?? details.paymentMethod}</Text>
      </View>

      {details.canCancel && (
        <Pressable style={styles.cancelButton} onPress={handleCancel} disabled={cancelling}>
          {cancelling ? (
            <ActivityIndicator color={colors.error} />
          ) : (
            <Text style={styles.cancelButtonText}>Cancelar pedido</Text>
          )}
        </Pressable>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Precisa de ajuda?</Text>
        {details.partner?.phone && (
          <Pressable
            style={styles.contactButton}
            onPress={() =>
              openWhatsApp(details.partner!.phone!, `Olá, sou cliente do pedido ${id} e preciso de ajuda.`)
            }
          >
            <Text style={styles.contactButtonText}>Falar com a distribuidora</Text>
          </Pressable>
        )}
        <Pressable style={styles.contactButtonSecondary} onPress={handleContactSupport}>
          <Text style={styles.contactButtonSecondaryText}>Falar com o suporte GUELA SECO</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 16,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  section: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 4,
  },
  partnerName: {
    fontSize: 17,
    fontWeight: "700",
  },
  muted: {
    fontSize: 13,
    color: colors.textMuted,
  },
  statusBadge: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "600",
    color: colors.red,
  },
  cancellationBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    backgroundColor: "#fdecea",
  },
  cancellationLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#c0392b",
  },
  cancellationText: {
    marginTop: 2,
    fontSize: 13,
    color: "#c0392b",
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  itemName: {
    fontSize: 14,
    flex: 1,
  },
  itemPrice: {
    fontSize: 14,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: "700",
    marginTop: 4,
  },
  totalValue: {
    fontSize: 15,
    fontWeight: "700",
    marginTop: 4,
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  cancelButtonText: {
    color: colors.error,
    fontWeight: "600",
  },
  contactButton: {
    backgroundColor: colors.red,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  contactButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  contactButtonSecondary: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  contactButtonSecondaryText: {
    color: colors.text,
    fontWeight: "600",
  },
});
