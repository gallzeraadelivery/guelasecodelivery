import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useSession } from "../../src/context/session";
import { supabase } from "../../src/lib/supabase";

export default function ProfileScreen() {
  const { session } = useSession();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <View style={styles.container}>
      <Text style={styles.email}>{session?.user.email}</Text>

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
