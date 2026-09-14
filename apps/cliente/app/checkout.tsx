import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { useSession } from "../src/context/session";
import { supabase } from "../src/lib/supabase";
import { getPaymentKey, payOrder, payOrderPix } from "../src/lib/backend";
import { createCardToken, identifyPaymentMethod } from "../src/lib/mercadopago";
import { colors } from "../src/theme/colors";

type PaymentMethod = "card" | "pix";

const REJECTION_MESSAGES: Record<string, string> = {
  cc_rejected_bad_filled_card_number: "Confira o número do cartão.",
  cc_rejected_bad_filled_date: "Confira a validade do cartão.",
  cc_rejected_bad_filled_security_code: "Confira o código de segurança (CVV).",
  cc_rejected_bad_filled_other: "Confira os dados do cartão.",
  cc_rejected_insufficient_amount: "Cartão sem limite suficiente.",
  cc_rejected_call_for_authorize: "Seu banco recusou a compra — ligue para o seu banco para autorizar.",
  cc_rejected_card_disabled: "Cartão desabilitado — entre em contato com seu banco.",
  cc_rejected_duplicated_payment: "Pagamento duplicado — este pedido já foi pago.",
  cc_rejected_high_risk: "Pagamento recusado por segurança. Tente outro cartão.",
  cc_rejected_max_attempts: "Muitas tentativas. Tente novamente mais tarde.",
};

function formatCardNumber(value: string): string {
  const digits = value.replace(/\D+/g, "").slice(0, 19);
  return (digits.match(/.{1,4}/g) ?? []).join(" ");
}

function formatExpiry(value: string): string {
  const digits = value.replace(/\D+/g, "").slice(0, 4);
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

export default function CheckoutScreen() {
  const { orderId, method: initialMethod } = useLocalSearchParams<{ orderId: string; method?: string }>();
  const { session } = useSession();

  const [method, setMethod] = useState<PaymentMethod>(initialMethod === "pix" ? "pix" : "card");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [loadingKey, setLoadingKey] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [payerName, setPayerName] = useState("");
  const [cpf, setCpf] = useState("");

  const [pix, setPix] = useState<{ qrCode: string; qrCodeBase64: string } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!session || !orderId) return;
    getPaymentKey(session.access_token, orderId)
      .then((result) => setPublicKey(result.publicKey))
      .catch((error) => {
        Alert.alert(
          "Não foi possível abrir o pagamento",
          error instanceof Error ? error.message : "Tente novamente.",
        );
        router.back();
      })
      .finally(() => setLoadingKey(false));
  }, [session, orderId]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function handleResult(status: string, statusDetail: string | null) {
    if (status === "APPROVED" || status === "PAID" || status === "PARTNER_CONFIRMATION") {
      router.replace("/(tabs)/orders");
      setTimeout(
        () => Alert.alert("Pagamento aprovado", "Seu pedido foi confirmado! Acompanhe na aba Pedidos."),
        300,
      );
      return;
    }
    if (status === "REJECTED" || status === "CANCELLED" || status === "PAYMENT_FAILED") {
      const message = (statusDetail && REJECTION_MESSAGES[statusDetail]) || "Tente novamente.";
      Alert.alert("Pagamento recusado", message);
      return;
    }
    router.replace("/(tabs)/orders");
    setTimeout(
      () =>
        Alert.alert(
          "Pagamento em análise",
          "Assim que for aprovado, seu pedido será confirmado automaticamente.",
        ),
      300,
    );
  }

  async function handlePayCard() {
    if (!publicKey || !session || !orderId) return;

    const digits = cardNumber.replace(/\s+/g, "");
    const cpfDigits = cpf.replace(/\D+/g, "");
    const [mm, yy] = expiry.split("/");

    if (
      digits.length < 13 ||
      !mm ||
      mm.length !== 2 ||
      !yy ||
      yy.length !== 2 ||
      cvv.length < 3 ||
      !payerName.trim() ||
      cpfDigits.length !== 11
    ) {
      Alert.alert("Dados incompletos", "Confira o número do cartão, validade, CVV, nome e CPF.");
      return;
    }

    setSubmitting(true);
    try {
      const identified = await identifyPaymentMethod(digits.slice(0, 6), publicKey);
      if (!identified) {
        Alert.alert("Cartão não reconhecido", "Verifique o número do cartão e tente novamente.");
        return;
      }

      const cardToken = await createCardToken(publicKey, {
        cardNumber: digits,
        expirationMonth: Number(mm),
        expirationYear: 2000 + Number(yy),
        securityCode: cvv,
        cardholderName: payerName.trim(),
        payerCpf: cpfDigits,
      });

      const result = await payOrder(session.access_token, orderId, {
        cardToken,
        paymentMethodId: identified.paymentMethodId,
        installments: 1,
        payerCpf: cpfDigits,
      });

      handleResult(result.status, result.statusDetail);
    } catch (error) {
      Alert.alert("Pagamento não concluído", error instanceof Error ? error.message : "Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGeneratePix() {
    if (!session || !orderId) return;
    const cpfDigits = cpf.replace(/\D+/g, "");

    if (!payerName.trim() || cpfDigits.length !== 11) {
      Alert.alert("Dados incompletos", "Confira o nome e o CPF do pagador.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await payOrderPix(session.access_token, orderId, {
        payerName: payerName.trim(),
        payerCpf: cpfDigits,
      });
      setPix({ qrCode: result.qrCode, qrCodeBase64: result.qrCodeBase64 });
      startPolling();
    } catch (error) {
      Alert.alert("Não foi possível gerar o Pix", error instanceof Error ? error.message : "Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  function startPolling() {
    if (!orderId) return;
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const { data } = await supabase.from("orders").select("status").eq("id", orderId).maybeSingle();
      if (data && data.status !== "AWAITING_PAYMENT" && data.status !== "STOCK_RESERVED") {
        if (pollRef.current) clearInterval(pollRef.current);
        handleResult(data.status, null);
      }
    }, 3000);
  }

  async function handleCopyPixCode() {
    if (!pix) return;
    await Clipboard.setStringAsync(pix.qrCode);
    Alert.alert("Copiado", "Código Pix copiado — cole no app do seu banco.");
  }

  if (loadingKey) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.red} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.form}>
        <View style={styles.methodSwitch}>
          <Pressable
            style={[styles.methodButton, method === "card" && styles.methodButtonActive]}
            onPress={() => setMethod("card")}
          >
            <Text style={[styles.methodButtonText, method === "card" && styles.methodButtonTextActive]}>
              Cartão de crédito
            </Text>
          </Pressable>
          <Pressable
            style={[styles.methodButton, method === "pix" && styles.methodButtonActive]}
            onPress={() => setMethod("pix")}
          >
            <Text style={[styles.methodButtonText, method === "pix" && styles.methodButtonTextActive]}>
              Pix
            </Text>
          </Pressable>
        </View>

        <Text style={styles.note}>Pagamento processado com segurança pelo Mercado Pago.</Text>

        {method === "card" && (
          <>
            <Text style={styles.label}>Número do cartão</Text>
            <TextInput
              style={styles.input}
              value={cardNumber}
              onChangeText={(text) => setCardNumber(formatCardNumber(text))}
              keyboardType="number-pad"
              placeholder="0000 0000 0000 0000"
              maxLength={23}
            />

            <View style={styles.row}>
              <View style={styles.rowItem}>
                <Text style={styles.label}>Validade</Text>
                <TextInput
                  style={styles.input}
                  value={expiry}
                  onChangeText={(text) => setExpiry(formatExpiry(text))}
                  keyboardType="number-pad"
                  placeholder="MM/AA"
                  maxLength={5}
                />
              </View>
              <View style={styles.rowItem}>
                <Text style={styles.label}>CVV</Text>
                <TextInput
                  style={styles.input}
                  value={cvv}
                  onChangeText={(text) => setCvv(text.replace(/\D+/g, "").slice(0, 4))}
                  keyboardType="number-pad"
                  placeholder="000"
                  maxLength={4}
                  secureTextEntry
                />
              </View>
            </View>
          </>
        )}

        {!pix && (
          <>
            <Text style={styles.label}>Nome {method === "card" ? "no cartão" : "completo"}</Text>
            <TextInput
              style={styles.input}
              value={payerName}
              onChangeText={setPayerName}
              placeholder={method === "card" ? "Como está impresso no cartão" : "Nome completo"}
              autoCapitalize="words"
            />

            <Text style={styles.label}>CPF do pagador</Text>
            <TextInput
              style={styles.input}
              value={cpf}
              onChangeText={(text) => setCpf(text.replace(/\D+/g, "").slice(0, 11))}
              keyboardType="number-pad"
              placeholder="Somente números"
              maxLength={11}
            />
          </>
        )}

        {method === "card" && (
          <Pressable style={styles.payButton} onPress={handlePayCard} disabled={submitting}>
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.payButtonText}>Pagar</Text>}
          </Pressable>
        )}

        {method === "pix" && !pix && (
          <Pressable style={styles.payButton} onPress={handleGeneratePix} disabled={submitting}>
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.payButtonText}>Gerar Pix</Text>
            )}
          </Pressable>
        )}

        {method === "pix" && pix && (
          <View style={styles.pixContainer}>
            <Image
              source={{ uri: `data:image/png;base64,${pix.qrCodeBase64}` }}
              style={styles.pixQr}
              resizeMode="contain"
            />
            <Text style={styles.pixHint}>
              Escaneie o QR code no app do seu banco ou copie o código abaixo.
            </Text>
            <Pressable style={styles.copyButton} onPress={handleCopyPixCode}>
              <Text style={styles.copyButtonText}>Copiar código Pix</Text>
            </Pressable>
            <View style={styles.pixWaiting}>
              <ActivityIndicator color={colors.red} />
              <Text style={styles.pixWaitingText}>Aguardando confirmação do pagamento…</Text>
            </View>
          </View>
        )}
      </ScrollView>
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
  form: {
    padding: 16,
    gap: 4,
  },
  methodSwitch: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    overflow: "hidden",
    marginBottom: 12,
  },
  methodButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
  },
  methodButtonActive: {
    backgroundColor: colors.red,
  },
  methodButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
  },
  methodButtonTextActive: {
    color: "#fff",
  },
  note: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 12,
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
  row: {
    flexDirection: "row",
    gap: 12,
  },
  rowItem: {
    flex: 1,
  },
  payButton: {
    backgroundColor: colors.red,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 24,
  },
  payButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  pixContainer: {
    alignItems: "center",
    marginTop: 16,
    gap: 12,
  },
  pixQr: {
    width: 220,
    height: 220,
  },
  pixHint: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
  },
  copyButton: {
    borderWidth: 1,
    borderColor: colors.red,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  copyButtonText: {
    color: colors.red,
    fontWeight: "600",
  },
  pixWaiting: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  pixWaitingText: {
    fontSize: 13,
    color: colors.textMuted,
  },
});
