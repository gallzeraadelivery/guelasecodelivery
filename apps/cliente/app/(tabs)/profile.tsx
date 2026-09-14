import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { supabase } from "../../src/lib/supabase";
import { useSession } from "../../src/context/session";
import { colors } from "../../src/theme/colors";

type MenuItem = {
  label: string;
  onPress: () => void;
};

export default function ProfileScreen() {
  const { session } = useSession();
  const [fullName, setFullName] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!session) return;
    supabase
      .from("profiles")
      .select("full_name")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data }) => setFullName(data?.full_name ?? null));
  }, [session]);

  useFocusEffect(load);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const menuItems: MenuItem[] = [
    { label: "Dados pessoais", onPress: () => router.push("/profile/personal") },
    { label: "Meus endereços", onPress: () => router.push("/profile/addresses") },
    { label: "Meus pedidos", onPress: () => router.push("/(tabs)/orders") },
    { label: "Suporte", onPress: () => router.push("/support") },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarInitial}>{(fullName ?? session?.user.email ?? "?").charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.name}>{fullName || "Complete seu nome"}</Text>
          <Text style={styles.email}>{session?.user.email}</Text>
        </View>
      </View>

      <View style={styles.menu}>
        {menuItems.map((item) => (
          <Pressable key={item.label} style={styles.menuItem} onPress={item.onPress}>
            <Text style={styles.menuItemText}>{item.label}</Text>
            <Text style={styles.menuItemChevron}>›</Text>
          </Pressable>
        ))}
      </View>

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
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 24,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "700",
  },
  headerInfo: {
    flex: 1,
  },
  name: {
    fontSize: 17,
    fontWeight: "700",
  },
  email: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  menu: {
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuItemText: {
    fontSize: 15,
  },
  menuItemChevron: {
    fontSize: 18,
    color: colors.textMuted,
  },
  signOutButton: {
    marginTop: "auto",
    alignItems: "center",
    paddingVertical: 12,
  },
  signOutButtonText: {
    color: colors.error,
    fontWeight: "600",
  },
});
