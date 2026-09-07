import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Link, router } from "expo-router";
import { supabase } from "../src/lib/supabase";
import { colors } from "../src/theme/colors";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setLoading(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    router.replace("/(tabs)/catalog");
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>GUELA SECO</Text>
      <Text style={styles.subtitle}>Bebida gelada, preço de distribuidora.</Text>

      <TextInput
        style={styles.input}
        placeholder="E-mail"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Senha"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable style={styles.button} onPress={handleLogin} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Entrar</Text>}
      </Pressable>

      <Link href="/signup" style={styles.link}>
        Criar conta
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    gap: 12,
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    textAlign: "center",
    color: colors.red,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: "center",
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  error: {
    color: colors.error,
    fontSize: 13,
  },
  button: {
    backgroundColor: colors.red,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: {
    color: colors.white,
    fontWeight: "600",
    fontSize: 16,
  },
  link: {
    textAlign: "center",
    marginTop: 8,
    color: colors.red,
    textDecorationLine: "underline",
  },
});
