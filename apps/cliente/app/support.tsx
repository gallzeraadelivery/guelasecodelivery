import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { supabase } from "../src/lib/supabase";
import { useSession } from "../src/context/session";
import { colors } from "../src/theme/colors";

type TicketRow = {
  id: string;
  subject: string;
  status: string;
  updated_at: string;
};

export default function SupportListScreen() {
  const { session } = useSession();
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newSubject, setNewSubject] = useState("");

  const load = useCallback(() => {
    supabase
      .from("support_tickets")
      .select("id, subject, status, updated_at")
      .order("updated_at", { ascending: false })
      .then(({ data }) => {
        setTickets(data ?? []);
        setLoading(false);
      });
  }, []);

  useFocusEffect(load);

  async function handleCreate() {
    if (!session || !newSubject.trim()) return;
    setCreating(true);
    try {
      const { data, error } = await supabase
        .from("support_tickets")
        .insert({ customer_id: session.user.id, subject: newSubject.trim() })
        .select("id")
        .single();

      if (error || !data) {
        Alert.alert("Não foi possível abrir o chamado", "Tente novamente em instantes.");
        return;
      }

      setNewSubject("");
      router.push(`/support/${data.id}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.newTicketBox}>
        <TextInput
          style={styles.input}
          placeholder="Qual o assunto? (ex: problema com o pedido)"
          value={newSubject}
          onChangeText={setNewSubject}
        />
        <Pressable style={styles.newTicketButton} onPress={handleCreate} disabled={creating || !newSubject.trim()}>
          {creating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.newTicketButtonText}>Abrir chamado</Text>
          )}
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loading} color={colors.red} />
      ) : (
        <FlatList
          data={tickets}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>Você ainda não abriu nenhum chamado.</Text>}
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => router.push(`/support/${item.id}`)}>
              <Text style={styles.subject}>{item.subject}</Text>
              <Text style={item.status === "OPEN" ? styles.statusOpen : styles.statusClosed}>
                {item.status === "OPEN" ? "Aberto" : "Fechado"}
              </Text>
            </Pressable>
          )}
        />
      )}
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
  newTicketBox: {
    gap: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  newTicketButton: {
    backgroundColor: colors.red,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  newTicketButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  loading: {
    marginTop: 24,
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
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  subject: {
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  statusOpen: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.red,
  },
  statusClosed: {
    fontSize: 12,
    color: colors.textMuted,
  },
});
