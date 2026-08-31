import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Location from "expo-location";
import { useSession } from "../../src/context/session";
import { supabase } from "../../src/lib/supabase";
import { submitKyc } from "../../src/lib/backend";

type DriverRow = { status: string; kyc_status: string };

const LOCATION_UPDATE_INTERVAL_MS = 20_000;
const LOCATION_UPDATE_DISTANCE_M = 50;

export default function StatusScreen() {
  const { session } = useSession();
  const [driver, setDriver] = useState<DriverRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [togglingStatus, setTogglingStatus] = useState(false);

  const [cpf, setCpf] = useState("");
  const [cnhNumber, setCnhNumber] = useState("");
  const [cnhCategory, setCnhCategory] = useState("");
  const [submittingKyc, setSubmittingKyc] = useState(false);
  const [kycError, setKycError] = useState<string | null>(null);

  const locationSubscription = useRef<Location.LocationSubscription | null>(null);

  const loadDriver = useCallback(async () => {
    if (!session) return;
    const { data } = await supabase
      .from("drivers")
      .select("status, kyc_status")
      .eq("id", session.user.id)
      .maybeSingle<DriverRow>();
    setDriver(data);
    setLoading(false);
  }, [session]);

  useEffect(() => {
    void loadDriver();
  }, [loadDriver]);

  useEffect(() => {
    return () => {
      locationSubscription.current?.remove();
    };
  }, []);

  async function startLocationUpdates() {
    if (!session) return;

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      throw new Error("Permissão de localização negada.");
    }

    locationSubscription.current?.remove();
    locationSubscription.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, timeInterval: LOCATION_UPDATE_INTERVAL_MS, distanceInterval: LOCATION_UPDATE_DISTANCE_M },
      (position) => {
        void supabase.from("driver_locations").upsert({
          driver_id: session.user.id,
          location: `POINT(${position.coords.longitude} ${position.coords.latitude})`,
          updated_at: new Date().toISOString(),
        });
      },
    );
  }

  function stopLocationUpdates() {
    locationSubscription.current?.remove();
    locationSubscription.current = null;
  }

  async function handleToggleOnline(value: boolean) {
    if (!session || !driver) return;
    setTogglingStatus(true);

    try {
      if (value) {
        await startLocationUpdates();
      } else {
        stopLocationUpdates();
      }

      const { error } = await supabase
        .from("drivers")
        .update({ status: value ? "ONLINE" : "OFFLINE" })
        .eq("id", session.user.id);

      if (error) {
        stopLocationUpdates();
        Alert.alert("Não foi possível mudar de status", error.message);
        return;
      }

      setDriver({ ...driver, status: value ? "ONLINE" : "OFFLINE" });
    } catch (error) {
      Alert.alert("Localização necessária", (error as Error).message);
    } finally {
      setTogglingStatus(false);
    }
  }

  async function handleSubmitKyc() {
    if (!session) return;
    if (!cpf.trim() || !cnhNumber.trim() || !cnhCategory.trim()) {
      setKycError("Preencha CPF, número e categoria da CNH.");
      return;
    }

    setSubmittingKyc(true);
    setKycError(null);

    try {
      await submitKyc(session.access_token, { cpf, cnhNumber, cnhCategory });
      Alert.alert("Enviado", "Sua verificação foi enviada e está em análise.");
      await loadDriver();
    } catch (error) {
      setKycError((error as Error).message);
    } finally {
      setSubmittingKyc(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!driver) {
    return (
      <View style={styles.center}>
        <Text>Não foi possível carregar seus dados.</Text>
      </View>
    );
  }

  if (driver.kyc_status !== "APPROVED") {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Verificação de identidade</Text>
        <Text style={styles.subtitle}>
          Status: {driver.kyc_status === "PENDING" ? "aguardando envio" : driver.kyc_status}
        </Text>
        <Text style={styles.note}>
          Para aceitar corridas você precisa passar pela verificação de identidade (KYC).
        </Text>

        <TextInput style={styles.input} placeholder="CPF" value={cpf} onChangeText={setCpf} keyboardType="numeric" />
        <TextInput
          style={styles.input}
          placeholder="Número da CNH"
          value={cnhNumber}
          onChangeText={setCnhNumber}
        />
        <TextInput
          style={styles.input}
          placeholder="Categoria da CNH (ex: A, AB)"
          value={cnhCategory}
          onChangeText={setCnhCategory}
        />

        {kycError && <Text style={styles.error}>{kycError}</Text>}

        <Pressable style={styles.button} onPress={handleSubmitKyc} disabled={submittingKyc}>
          {submittingKyc ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Enviar para verificação</Text>
          )}
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Você está {driver.status === "ONLINE" ? "online" : "offline"}</Text>
      <Text style={styles.subtitle}>
        {driver.status === "ONLINE"
          ? "Recebendo ofertas de corrida perto de você."
          : "Fique online para começar a receber corridas."}
      </Text>

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Online</Text>
        <Switch
          value={driver.status === "ONLINE"}
          onValueChange={handleToggleOnline}
          disabled={togglingStatus}
        />
      </View>
    </View>
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
    padding: 24,
    gap: 12,
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 14,
    color: "#666",
  },
  note: {
    fontSize: 13,
    color: "#999",
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  error: {
    color: "#c00",
    fontSize: 13,
  },
  button: {
    backgroundColor: "#000",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 10,
  },
  switchLabel: {
    fontSize: 16,
    fontWeight: "600",
  },
});
