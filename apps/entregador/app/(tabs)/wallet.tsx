import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { useSession } from "../../src/context/session";
import { supabase } from "../../src/lib/supabase";
import { requestWithdrawal, type PixKeyType } from "../../src/lib/backend";

type LedgerRow = {
  id: string;
  type: string;
  amount_cents: number;
  status: string;
  description: string | null;
  created_at: string;
};

type WithdrawalRow = {
  id: string;
  amount_cents: number;
  status: string;
  pix_key: string;
  created_at: string;
};

const LEDGER_TYPE_LABELS: Record<string, string> = {
  DELIVERY_CREDIT: "Corrida",
  WITHDRAWAL: "Saque",
  WITHDRAWAL_FEE: "Taxa de saque",
  BONUS: "Bônus",
  ADJUSTMENT: "Ajuste",
  REVERSAL: "Estorno",
};

const WITHDRAWAL_STATUS_LABELS: Record<string, string> = {
  REQUESTED: "Solicitado",
  UNDER_REVIEW: "Em análise",
  PROCESSING: "Processando",
  PAID: "Pago",
  FAILED: "Falhou",
  CANCELLED: "Cancelado",
};

const PIX_KEY_TYPES: PixKeyType[] = ["CPF", "CNPJ", "EMAIL", "PHONE", "RANDOM"];

function formatCents(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function WalletScreen() {
  const { session } = useSession();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [availableCents, setAvailableCents] = useState(0);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState("");
  const [pixKey, setPixKey] = useState("");
  const [pixKeyType, setPixKeyType] = useState<PixKeyType>("RANDOM");
  const [holderName, setHolderName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;

    const [walletResult, ledgerResult, withdrawalsResult] = await Promise.all([
      // RLS de wallet_balances filtra pelo wallet_ledger subjacente — a view
      // já retorna só a linha da própria carteira do entregador autenticado,
      // sem precisar informar driver_id explicitamente.
      supabase.from("wallet_balances").select("available_cents").maybeSingle<{ available_cents: number }>(),
      supabase
        .from("wallet_ledger")
        .select("id, type, amount_cents, status, description, created_at")
        .order("created_at", { ascending: false })
        .limit(20)
        .returns<LedgerRow[]>(),
      supabase
        .from("withdrawals")
        .select("id, amount_cents, status, pix_key, created_at")
        .order("created_at", { ascending: false })
        .limit(10)
        .returns<WithdrawalRow[]>(),
    ]);

    setAvailableCents(walletResult.data?.available_cents ?? 0);
    setLedger(ledgerResult.data ?? []);
    setWithdrawals(withdrawalsResult.data ?? []);
    setLoading(false);
    setRefreshing(false);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function handleRefresh() {
    setRefreshing(true);
    await load();
  }

  async function handleRequestWithdrawal() {
    if (!session) return;
    setFormError(null);

    const amountCents = Math.round(Number(amount.replace(",", ".")) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      setFormError("Informe um valor válido.");
      return;
    }
    if (!pixKey.trim() || !holderName.trim()) {
      setFormError("Preencha a chave PIX e o nome do titular.");
      return;
    }

    setSubmitting(true);
    try {
      await requestWithdrawal(session.access_token, {
        amountCents,
        pixKey: pixKey.trim(),
        pixKeyType,
        holderName: holderName.trim(),
      });
      setAmount("");
      setPixKey("");
      setHolderName("");
      setShowForm(false);
      Alert.alert("Saque solicitado", "Seu saque foi solicitado e está sendo processado.");
      await load();
    } catch (error) {
      setFormError((error as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Saldo disponível</Text>
        <Text style={styles.balanceValue}>{formatCents(availableCents)}</Text>

        {!showForm ? (
          <Pressable style={styles.button} onPress={() => setShowForm(true)}>
            <Text style={styles.buttonText}>Sacar via PIX</Text>
          </Pressable>
        ) : (
          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="Valor (ex: 50,00)"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
            />
            <View style={styles.pixTypeRow}>
              {PIX_KEY_TYPES.map((type) => (
                <Pressable
                  key={type}
                  style={[styles.pixTypeChip, pixKeyType === type && styles.pixTypeChipActive]}
                  onPress={() => setPixKeyType(type)}
                >
                  <Text style={[styles.pixTypeChipText, pixKeyType === type && styles.pixTypeChipTextActive]}>
                    {type}
                  </Text>
                </Pressable>
              ))}
            </View>
            <TextInput style={styles.input} placeholder="Chave PIX" value={pixKey} onChangeText={setPixKey} />
            <TextInput
              style={styles.input}
              placeholder="Nome do titular"
              value={holderName}
              onChangeText={setHolderName}
            />

            {formError && <Text style={styles.error}>{formError}</Text>}

            <Pressable style={styles.button} onPress={handleRequestWithdrawal} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Confirmar saque</Text>}
            </Pressable>
            <Pressable style={styles.cancelButton} onPress={() => setShowForm(false)} disabled={submitting}>
              <Text style={styles.cancelButtonText}>Cancelar</Text>
            </Pressable>
          </View>
        )}
      </View>

      {withdrawals.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Saques</Text>
          {withdrawals.map((item) => (
            <View key={item.id} style={styles.row}>
              <View>
                <Text style={styles.rowTitle}>{formatCents(item.amount_cents)}</Text>
                <Text style={styles.rowSubtitle}>{formatDate(item.created_at)}</Text>
              </View>
              <Text style={styles.rowStatus}>{WITHDRAWAL_STATUS_LABELS[item.status] ?? item.status}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Extrato</Text>
        {ledger.length === 0 ? (
          <Text style={styles.empty}>Nenhuma movimentação ainda.</Text>
        ) : (
          ledger.map((item) => (
            <View key={item.id} style={styles.row}>
              <View>
                <Text style={styles.rowTitle}>{LEDGER_TYPE_LABELS[item.type] ?? item.type}</Text>
                <Text style={styles.rowSubtitle}>{formatDate(item.created_at)}</Text>
              </View>
              <Text style={[styles.rowAmount, item.amount_cents < 0 && styles.rowAmountNegative]}>
                {item.amount_cents > 0 ? "+" : ""}
                {formatCents(item.amount_cents)}
              </Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  content: {
    padding: 16,
    gap: 16,
  },
  balanceCard: {
    padding: 20,
    borderRadius: 12,
    backgroundColor: "#f2f2f2",
    alignItems: "center",
    gap: 8,
  },
  balanceLabel: {
    fontSize: 13,
    color: "#666",
  },
  balanceValue: {
    fontSize: 32,
    fontWeight: "700",
  },
  button: {
    backgroundColor: "#000",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: "center",
    marginTop: 8,
    width: "100%",
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
  form: {
    width: "100%",
    gap: 10,
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: "#fff",
  },
  pixTypeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  pixTypeChip: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pixTypeChipActive: {
    backgroundColor: "#000",
    borderColor: "#000",
  },
  pixTypeChipText: {
    fontSize: 13,
    color: "#333",
  },
  pixTypeChipTextActive: {
    color: "#fff",
  },
  error: {
    color: "#c00",
    fontSize: 13,
  },
  cancelButton: {
    alignItems: "center",
    paddingVertical: 8,
  },
  cancelButtonText: {
    color: "#666",
    fontSize: 14,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  empty: {
    color: "#999",
    fontSize: 14,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  rowSubtitle: {
    fontSize: 12,
    color: "#999",
  },
  rowAmount: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0a0",
  },
  rowAmountNegative: {
    color: "#c00",
  },
  rowStatus: {
    fontSize: 13,
    color: "#666",
  },
});
