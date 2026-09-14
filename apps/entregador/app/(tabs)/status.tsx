import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import MapView, { Marker } from "react-native-maps";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { useSession } from "../../src/context/session";
import { supabase } from "../../src/lib/supabase";
import {
  acceptOffer,
  markArrivedAtPickup,
  markDelivered,
  markPickedUp,
  rejectOffer,
  submitKyc,
  getDeliveryNavigation,
  getDeliveryItems,
  type NavigationPoint,
  type DeliveryItem,
} from "../../src/lib/backend";
import { colors } from "../../src/theme/colors";

type DriverRow = { status: string; kyc_status: string };

const ACTIVE_DELIVERY_STATUSES = ["TO_PICKUP", "AT_PICKUP", "DELIVERING"];

type ActiveDelivery = {
  id: string;
  status: string;
  partners: { trade_name: string } | null;
};

type OfferRow = {
  id: string;
  distance_to_pickup_km: number;
  distance_to_dropoff_km: number;
  total_distance_km: number;
  eta_minutes: number;
  payout_cents: number;
  deliveries: { partners: { trade_name: string } | null } | null;
};

const LOCATION_UPDATE_INTERVAL_MS = 20_000;
const LOCATION_UPDATE_DISTANCE_M = 50;
const OFFER_POLL_INTERVAL_MS = 5_000;

function formatCents(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2)}`;
}

export default function StatusScreen() {
  const { session } = useSession();
  const [driver, setDriver] = useState<DriverRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [offer, setOffer] = useState<OfferRow | null>(null);
  const [respondingOffer, setRespondingOffer] = useState(false);
  const [activeDelivery, setActiveDelivery] = useState<ActiveDelivery | null>(null);
  const [updatingDelivery, setUpdatingDelivery] = useState(false);
  const [navigation, setNavigation] = useState<{
    target: "PICKUP" | "DROPOFF";
    pickup: NavigationPoint;
    dropoff: NavigationPoint;
  } | null>(null);
  const [checklistItems, setChecklistItems] = useState<DeliveryItem[]>([]);
  const [checkedItemIds, setCheckedItemIds] = useState<Set<string>>(new Set());

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

  const pollOffer = useCallback(async () => {
    if (!session) return;
    const { data } = await supabase
      .from("delivery_offers")
      .select(
        "id, distance_to_pickup_km, distance_to_dropoff_km, total_distance_km, eta_minutes, payout_cents, deliveries(partners(trade_name))",
      )
      .eq("driver_id", session.user.id)
      .eq("status", "OFFERED")
      .gt("expires_at", new Date().toISOString())
      .order("offered_at", { ascending: false })
      .limit(1)
      .maybeSingle<OfferRow>();
    setOffer(data);
  }, [session]);

  useEffect(() => {
    if (driver?.status !== "ONLINE") {
      setOffer(null);
      return;
    }

    void pollOffer();
    const interval = setInterval(() => void pollOffer(), OFFER_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [driver?.status, pollOffer]);

  const loadActiveDelivery = useCallback(async () => {
    if (!session) return;
    const { data } = await supabase
      .from("deliveries")
      .select("id, status, partners(trade_name)")
      .eq("driver_id", session.user.id)
      .in("status", ACTIVE_DELIVERY_STATUSES)
      .maybeSingle<ActiveDelivery>();
    setActiveDelivery(data);
  }, [session]);

  useEffect(() => {
    if (driver && ACTIVE_DELIVERY_STATUSES.includes(driver.status)) {
      void loadActiveDelivery();
    } else {
      setActiveDelivery(null);
    }
  }, [driver, loadActiveDelivery]);

  useEffect(() => {
    if (!session || !activeDelivery) {
      setNavigation(null);
      return;
    }
    getDeliveryNavigation(session.access_token, activeDelivery.id)
      .then(setNavigation)
      .catch(() => setNavigation(null));
  }, [session, activeDelivery]);

  async function openExternalNavigation(point: NavigationPoint) {
    if (point.lat === null || point.lng === null) return;

    // Em alguns aparelhos/ROMs (ex: MIUI) o link https do Maps pode ser
    // bloqueado quando aberto de dentro de outro app — nesses casos o intent
    // nativo "geo:" do Android costuma funcionar normalmente.
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${point.lat},${point.lng}&travelmode=driving`;
    const geoUrl = `geo:${point.lat},${point.lng}?q=${point.lat},${point.lng}(${encodeURIComponent(point.label)})`;

    try {
      await Linking.openURL(mapsUrl);
    } catch {
      try {
        await Linking.openURL(geoUrl);
      } catch (error) {
        Alert.alert("Não foi possível abrir a navegação", (error as Error).message);
      }
    }
  }

  useEffect(() => {
    if (!session || !activeDelivery || activeDelivery.status !== "AT_PICKUP") {
      setChecklistItems([]);
      setCheckedItemIds(new Set());
      return;
    }
    getDeliveryItems(session.access_token, activeDelivery.id)
      .then((items) => {
        setChecklistItems(items);
        setCheckedItemIds(new Set());
      })
      .catch(() => setChecklistItems([]));
  }, [session, activeDelivery]);

  function toggleChecklistItem(itemId: string) {
    setCheckedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }

  async function startLocationUpdates() {
    if (!session) return;

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      throw new Error("Permissão de localização negada.");
    }

    // watchPositionAsync só chama o callback quando o aparelho se move
    // distanceInterval — se o entregador ficar online parado (comum em
    // testes, e mesmo em uso real logo ao abrir o app), nunca dispararia
    // nenhuma atualização. Por isso pega a posição atual direto aqui, antes
    // de começar a observar o movimento.
    const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    await supabase.from("driver_locations").upsert({
      driver_id: session.user.id,
      location: `POINT(${current.coords.longitude} ${current.coords.latitude})`,
      updated_at: new Date().toISOString(),
    });

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

  /**
   * Nice-to-have: se falhar (permissão negada, push ainda não configurado
   * no projeto), não deve impedir o entregador de ficar online — só fica
   * sem notificação e continua vendo a oferta pelo polling normal.
   */
  async function registerPushToken() {
    if (!session) return;
    try {
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "default",
          importance: Notifications.AndroidImportance.HIGH,
        });
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== "granted") {
        Alert.alert("Push (diagnóstico)", `Permissão de notificação não concedida: ${finalStatus}`);
        return;
      }

      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      const pushToken = await Notifications.getExpoPushTokenAsync({ projectId });

      const { error } = await supabase
        .from("drivers")
        .update({ push_token: pushToken.data })
        .eq("id", session.user.id);

      if (error) {
        Alert.alert("Push (diagnóstico)", `Falhou salvar no banco: ${error.message}`);
      } else {
        Alert.alert("Push (diagnóstico)", `Token registrado: ${pushToken.data.slice(0, 30)}...`);
      }
    } catch (error) {
      // não bloqueia ficar online — o alerta é só temporário, pra diagnosticar
      // por que o token nunca registrou no teste real.
      Alert.alert("Push (diagnóstico)", `Erro: ${(error as Error).message}`);
    }
  }

  async function handleToggleOnline(value: boolean) {
    if (!session || !driver) return;
    setTogglingStatus(true);

    try {
      if (value) {
        await startLocationUpdates();
        await registerPushToken();
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

  async function handleAcceptOffer() {
    if (!session || !offer) return;
    setRespondingOffer(true);
    try {
      await acceptOffer(session.access_token, offer.id);
      setOffer(null);
      await loadDriver();
    } catch (error) {
      Alert.alert("Não foi possível aceitar", (error as Error).message);
      await pollOffer();
    } finally {
      setRespondingOffer(false);
    }
  }

  async function handleRejectOffer() {
    if (!session || !offer) return;
    setRespondingOffer(true);
    try {
      await rejectOffer(session.access_token, offer.id);
      setOffer(null);
    } catch (error) {
      Alert.alert("Não foi possível recusar", (error as Error).message);
    } finally {
      setRespondingOffer(false);
    }
  }

  async function handleDeliveryStep(action: (token: string, deliveryId: string) => Promise<void>) {
    if (!session || !activeDelivery) return;
    setUpdatingDelivery(true);
    try {
      await action(session.access_token, activeDelivery.id);
      await Promise.all([loadDriver(), loadActiveDelivery()]);
    } catch (error) {
      Alert.alert("Não foi possível atualizar", (error as Error).message);
    } finally {
      setUpdatingDelivery(false);
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

  if (driver.status !== "ONLINE" && driver.status !== "OFFLINE") {
    const navTarget = navigation ? (navigation.target === "PICKUP" ? navigation.pickup : navigation.dropoff) : null;
    const hasCoords = navTarget && navTarget.lat !== null && navTarget.lng !== null;

    return (
      <View style={styles.container}>
        <Text style={styles.title}>{activeDelivery?.partners?.trade_name ?? "Corrida em andamento"}</Text>

        {hasCoords && (
          <>
            <MapView
              style={styles.map}
              showsUserLocation
              region={{
                latitude: navTarget.lat as number,
                longitude: navTarget.lng as number,
                latitudeDelta: 0.02,
                longitudeDelta: 0.02,
              }}
            >
              <Marker
                coordinate={{ latitude: navTarget.lat as number, longitude: navTarget.lng as number }}
                title={navTarget.label}
                description={navTarget.addressText ?? undefined}
                pinColor={navigation?.target === "PICKUP" ? colors.red : "#1a73e8"}
              />
            </MapView>
            {navTarget.addressText && <Text style={styles.note}>{navTarget.addressText}</Text>}
            <Pressable style={styles.navigateButton} onPress={() => openExternalNavigation(navTarget)}>
              <Text style={styles.navigateButtonText}>Abrir navegação (GPS)</Text>
            </Pressable>
          </>
        )}

        {!activeDelivery ? (
          <ActivityIndicator />
        ) : (
          <>
            {activeDelivery.status === "TO_PICKUP" && (
              <>
                <Text style={styles.subtitle}>A caminho da distribuidora para retirar o pedido.</Text>
                <Pressable
                  style={styles.button}
                  onPress={() => handleDeliveryStep(markArrivedAtPickup)}
                  disabled={updatingDelivery}
                >
                  {updatingDelivery ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>Cheguei na distribuidora</Text>
                  )}
                </Pressable>
              </>
            )}
            {activeDelivery.status === "AT_PICKUP" && (
              <>
                <Text style={styles.subtitle}>Você está na distribuidora. Confira cada item antes de sair.</Text>

                {checklistItems.length === 0 ? (
                  <ActivityIndicator />
                ) : (
                  <View style={styles.checklist}>
                    {checklistItems.map((item) => {
                      const checked = checkedItemIds.has(item.id);
                      return (
                        <Pressable
                          key={item.id}
                          style={styles.checklistRow}
                          onPress={() => toggleChecklistItem(item.id)}
                        >
                          <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                            {checked && <Text style={styles.checkboxMark}>✓</Text>}
                          </View>
                          <Text style={styles.checklistItemText}>
                            {item.quantity}x {item.productName}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}

                <Pressable
                  style={[
                    styles.button,
                    (checklistItems.length === 0 || checkedItemIds.size < checklistItems.length) &&
                      styles.buttonDisabled,
                  ]}
                  onPress={() => handleDeliveryStep(markPickedUp)}
                  disabled={
                    updatingDelivery || checklistItems.length === 0 || checkedItemIds.size < checklistItems.length
                  }
                >
                  {updatingDelivery ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>Retirei o pedido</Text>
                  )}
                </Pressable>
              </>
            )}
            {activeDelivery.status === "DELIVERING" && (
              <>
                <Text style={styles.subtitle}>A caminho do cliente.</Text>
                <Pressable
                  style={styles.button}
                  onPress={() => handleDeliveryStep(markDelivered)}
                  disabled={updatingDelivery}
                >
                  {updatingDelivery ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>Entreguei ao cliente</Text>
                  )}
                </Pressable>
              </>
            )}
          </>
        )}
      </View>
    );
  }

  if (offer) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{offer.deliveries?.partners?.trade_name ?? "Nova corrida"}</Text>

        <View style={styles.offerRow}>
          <Text style={styles.offerLabel}>Até a retirada</Text>
          <Text style={styles.offerValue}>{offer.distance_to_pickup_km.toFixed(1)} km</Text>
        </View>
        <View style={styles.offerRow}>
          <Text style={styles.offerLabel}>Entrega</Text>
          <Text style={styles.offerValue}>{offer.distance_to_dropoff_km.toFixed(1)} km</Text>
        </View>
        <View style={styles.offerRow}>
          <Text style={styles.offerLabel}>Total estimado</Text>
          <Text style={styles.offerValue}>
            {offer.total_distance_km.toFixed(1)} km · {offer.eta_minutes} min
          </Text>
        </View>

        <View style={styles.payoutBox}>
          <Text style={styles.payoutLabel}>Você recebe</Text>
          <Text style={styles.payoutValue}>{formatCents(offer.payout_cents)}</Text>
        </View>

        <Pressable style={styles.button} onPress={handleAcceptOffer} disabled={respondingOffer}>
          {respondingOffer ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Aceitar</Text>}
        </Pressable>
        <Pressable style={styles.rejectButton} onPress={handleRejectOffer} disabled={respondingOffer}>
          <Text style={styles.rejectButtonText}>Recusar</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Você está {driver.status === "ONLINE" ? "online" : "offline"}</Text>
      <Text style={styles.subtitle}>
        {driver.status === "ONLINE"
          ? "Procurando corridas perto de você..."
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
  map: {
    width: "100%",
    height: 220,
    borderRadius: 10,
  },
  navigateButton: {
    backgroundColor: "#1a73e8",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  navigateButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
  checklist: {
    gap: 4,
  },
  checklistRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#ccc",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: colors.red,
    borderColor: colors.red,
  },
  checkboxMark: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  checklistItemText: {
    fontSize: 15,
    flex: 1,
  },
  buttonDisabled: {
    opacity: 0.4,
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
    backgroundColor: colors.red,
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
  rejectButton: {
    borderWidth: 1,
    borderColor: "#c00",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  rejectButtonText: {
    color: "#c00",
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
  offerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  offerLabel: {
    fontSize: 14,
    color: "#666",
  },
  offerValue: {
    fontSize: 14,
    fontWeight: "600",
  },
  payoutBox: {
    marginTop: 12,
    marginBottom: 8,
    padding: 16,
    borderRadius: 10,
    backgroundColor: "#f2f2f2",
    alignItems: "center",
  },
  payoutLabel: {
    fontSize: 13,
    color: "#666",
  },
  payoutValue: {
    fontSize: 28,
    fontWeight: "700",
  },
});
