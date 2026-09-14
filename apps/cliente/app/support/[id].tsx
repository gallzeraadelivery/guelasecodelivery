import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { supabase } from "../../src/lib/supabase";
import { useSession } from "../../src/context/session";
import { colors } from "../../src/theme/colors";

type MessageRow = {
  id: string;
  sender_role: "customer" | "admin";
  sender_id: string;
  body: string;
  created_at: string;
};

export default function SupportChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();

  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<MessageRow>>(null);

  const loadMessages = useCallback(() => {
    if (!id) return;
    supabase
      .from("support_messages")
      .select("id, sender_role, sender_id, body, created_at")
      .eq("ticket_id", id)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        setMessages((data ?? []) as MessageRow[]);
        setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`support_messages:${id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_messages", filter: `ticket_id=eq.${id}` },
        (payload) => {
          setMessages((current) => {
            const next = payload.new as MessageRow;
            if (current.some((m) => m.id === next.id)) return current;
            return [...current, next];
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  async function handleSend() {
    if (!session || !id || !text.trim()) return;
    const body = text.trim();
    setText("");
    setSending(true);
    try {
      await supabase
        .from("support_messages")
        .insert({ ticket_id: id, sender_role: "customer", sender_id: session.user.id, body });
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.red} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const isMine = item.sender_role === "customer";
          return (
            <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
              {!isMine && <Text style={styles.senderLabel}>Suporte GUELA SECO</Text>}
              <Text style={isMine ? styles.bubbleTextMine : styles.bubbleTextTheirs}>{item.body}</Text>
            </View>
          );
        }}
      />

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Digite sua mensagem"
          value={text}
          onChangeText={setText}
          multiline
        />
        <Pressable style={styles.sendButton} onPress={handleSend} disabled={sending || !text.trim()}>
          <Text style={styles.sendButtonText}>Enviar</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
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
  bubble: {
    maxWidth: "80%",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bubbleMine: {
    alignSelf: "flex-end",
    backgroundColor: colors.red,
  },
  bubbleTheirs: {
    alignSelf: "flex-start",
    backgroundColor: "#f0f0f0",
  },
  senderLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textMuted,
    marginBottom: 2,
  },
  bubbleTextMine: {
    color: "#fff",
    fontSize: 14,
  },
  bubbleTextTheirs: {
    color: colors.text,
    fontSize: 14,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: colors.red,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sendButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
});
