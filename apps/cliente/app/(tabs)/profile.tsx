import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { supabase } from "../../src/lib/supabase";
import { useSession } from "../../src/context/session";
import type { Address } from "../../src/lib/types";

export default function ProfileScreen() {
  const { session } = useSession();
  const [addresses, setAddresses] = useState<Address[]>([]);

  const loadAddresses = useCallback(() => {
    supabase
      .from("addresses")
      .select("id, label, address_line, number, complement, neighborhood, city, state, postal_code, is_default")
      .order("is_default", { ascending: false })
      .then(({ data }) => setAddresses(data ?? []));
  }, []);

  useEffect(() => {
    loadAddresses();
  }, [loadAddresses]);

  useFocusEffect(loadAddresses);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <View style={styles.container}>
      <Text style={styles.email}>{session?.user.email}</Text>

      <Text style={styles.sectionTitle}>Meus endereços</Text>
      <FlatList
        data={addresses}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.empty}>Nenhum endereço cadastrado.</Text>}
        renderItem={({ item }) => (
          <View style={styles.addressCard}>
            <Text style={styles.addressLabel}>
              {item.label || "Endereço"} {item.is_default ? "· padrão" : ""}
            </Text>
            <Text style={styles.addressText}>
              {item.address_line}
              {item.number ? `, ${item.number}` : ""} — {item.city}/{item.state}
            </Text>
          </View>
        )}
      />

      <Pressable style={styles.addAddressButton} onPress={() => router.push("/address")}>
        <Text style={styles.addAddressButtonText}>+ Adicionar endereço</Text>
      </Pressable>

      <Pressable style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutButtonText}>Sair</Text>
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
  email: {
    fontSize: 16,
    fontWeight: "600",
  },
  sectionTitle: {
    fontSize: 14,
    color: "#666",
    marginTop: 8,
  },
  empty: {
    color: "#999",
    fontSize: 13,
  },
  addressCard: {
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  addressLabel: {
    fontWeight: "600",
    marginBottom: 2,
  },
  addressText: {
    fontSize: 13,
    color: "#666",
  },
  addAddressButton: {
    borderWidth: 1,
    borderColor: "#000",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  addAddressButtonText: {
    fontWeight: "600",
  },
  signOutButton: {
    marginTop: "auto",
    alignItems: "center",
    paddingVertical: 12,
  },
  signOutButtonText: {
    color: "#c00",
    fontWeight: "600",
  },
});
