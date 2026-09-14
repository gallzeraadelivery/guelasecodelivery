import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { supabase } from "../../src/lib/supabase";
import { useSession } from "../../src/context/session";
import { colors } from "../../src/theme/colors";

export default function PersonalDataScreen() {
  const { session } = useSession();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  const load = useCallback(() => {
    if (!session) return;
    supabase
      .from("profiles")
      .select("full_name, phone")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        setFullName(data?.full_name ?? "");
        setPhone(data?.phone ?? "");
        setLoading(false);
      });
  }, [session]);

  useFocusEffect(load);

  async function handleSave() {
    if (!session) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName.trim() || null, phone: phone.trim() || null })
      .eq("id", session.user.id);
    setSaving(false);

    if (error) {
      Alert.alert("Não foi possível salvar", "Tente novamente em instantes.");
      return;
    }
    Alert.alert("Dados atualizados", "Suas informações foram salvas.");
  }

  async function handleChangePassword() {
    if (newPassword.length < 6) {
      Alert.alert("Senha muito curta", "Use pelo menos 6 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("Senhas diferentes", "As duas senhas precisam ser iguais.");
      return;
    }

    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setChangingPassword(false);

    if (error) {
      Alert.alert("Não foi possível alterar a senha", error.message);
      return;
    }

    setNewPassword("");
    setConfirmPassword("");
    setShowPasswordForm(false);
    Alert.alert("Senha alterada", "Sua senha foi atualizada.");
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.red} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.label}>Nome completo</Text>
      <TextInput style={styles.input} value={fullName} onChangeText={setFullName} placeholder="Seu nome" />

      <Text style={styles.label}>Telefone</Text>
      <TextInput
        style={styles.input}
        value={phone}
        onChangeText={setPhone}
        placeholder="(65) 90000-0000"
        keyboardType="phone-pad"
      />

      <Text style={styles.label}>E-mail</Text>
      <View style={styles.readonlyBox}>
        <Text style={styles.readonlyText}>{session?.user.email}</Text>
      </View>

      <Pressable style={styles.saveButton} onPress={handleSave} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Salvar</Text>}
      </Pressable>

      {!showPasswordForm ? (
        <Pressable style={styles.secondaryButton} onPress={() => setShowPasswordForm(true)}>
          <Text style={styles.secondaryButtonText}>Alterar senha</Text>
        </Pressable>
      ) : (
        <View>
          <Text style={styles.label}>Nova senha</Text>
          <TextInput
            style={styles.input}
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder="Mínimo 6 caracteres"
            secureTextEntry
          />
          <Text style={styles.label}>Confirmar nova senha</Text>
          <TextInput
            style={styles.input}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Repita a senha"
            secureTextEntry
          />
          <Pressable style={styles.secondaryButton} onPress={handleChangePassword} disabled={changingPassword}>
            {changingPassword ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <Text style={styles.secondaryButtonText}>Confirmar nova senha</Text>
            )}
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 4,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    marginTop: 12,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  readonlyBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#f7f7f7",
  },
  readonlyText: {
    fontSize: 15,
    color: colors.textMuted,
  },
  saveButton: {
    backgroundColor: colors.red,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 24,
  },
  saveButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 12,
  },
  secondaryButtonText: {
    color: colors.text,
    fontWeight: "600",
  },
});
