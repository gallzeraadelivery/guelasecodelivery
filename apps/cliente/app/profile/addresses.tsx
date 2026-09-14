import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { supabase } from "../../src/lib/supabase";
import type { Address } from "../../src/lib/types";
import { colors } from "../../src/theme/colors";

export default function AddressesScreen() {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    supabase
      .from("addresses")
      .select("id, label, address_line, number, complement, neighborhood, city, state, postal_code, is_default")
      .order("is_default", { ascending: false })
      .then(({ data }) => {
        setAddresses(data ?? []);
        setLoading(false);
      });
  }, []);

  useFocusEffect(load);

  function handleDelete(id: string) {
    Alert.alert("Remover endereço", "Tem certeza que deseja remover este endereço?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Remover",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase.from("addresses").delete().eq("id", id);
          if (error) {
            Alert.alert("Não foi possível remover", "Tente novamente em instantes.");
            return;
          }
          load();
        },
      },
    ]);
  }

  async function handleSetDefault(id: string) {
    await supabase.from("addresses").update({ is_default: false }).neq("id", id);
    await supabase.from("addresses").update({ is_default: true }).eq("id", id);
    load();
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.red} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={addresses}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>Nenhum endereço cadastrado.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardInfo}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>{item.label || "Endereço"}</Text>
                {item.is_default && <Text style={styles.defaultTag}>Padrão</Text>}
              </View>
              <Text style={styles.addressText}>
                {item.address_line}
                {item.number ? `, ${item.number}` : ""}
                {item.complement ? ` — ${item.complement}` : ""}
              </Text>
              <Text style={styles.addressText}>
                {item.neighborhood ? `${item.neighborhood}, ` : ""}
                {item.city}/{item.state}
              </Text>
            </View>
            <View style={styles.actions}>
              {!item.is_default && (
                <Pressable onPress={() => handleSetDefault(item.id)}>
                  <Text style={styles.actionLink}>Tornar padrão</Text>
                </Pressable>
              )}
              <Pressable onPress={() => router.push({ pathname: "/address", params: { id: item.id } })}>
                <Text style={styles.actionLink}>Editar</Text>
              </Pressable>
              <Pressable onPress={() => handleDelete(item.id)}>
                <Text style={styles.actionLinkDanger}>Remover</Text>
              </Pressable>
            </View>
          </View>
        )}
      />

      <Pressable style={styles.addButton} onPress={() => router.push("/address")}>
        <Text style={styles.addButtonText}>+ Adicionar endereço</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 16,
    gap: 12,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  list: {
    gap: 8,
  },
  empty: {
    textAlign: "center",
    color: colors.textMuted,
    marginTop: 24,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  cardInfo: {
    gap: 2,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  label: {
    fontSize: 15,
    fontWeight: "700",
  },
  defaultTag: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.red,
    borderWidth: 1,
    borderColor: colors.red,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  addressText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  actions: {
    flexDirection: "row",
    gap: 16,
  },
  actionLink: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
  },
  actionLinkDanger: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.error,
  },
  addButton: {
    borderWidth: 1,
    borderColor: "#000",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  addButtonText: {
    fontWeight: "600",
  },
});
