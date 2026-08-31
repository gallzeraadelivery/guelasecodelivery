import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Location from "expo-location";
import { router } from "expo-router";
import { supabase } from "../src/lib/supabase";
import { useSession } from "../src/context/session";

export default function AddressScreen() {
  const { session } = useSession();
  const [label, setLabel] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [number, setNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("Cuiabá");
  const [state, setState] = useState("MT");
  const [postalCode, setPostalCode] = useState("");
  const [isDefault, setIsDefault] = useState(true);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleUseCurrentLocation() {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permissão negada", "Não foi possível acessar sua localização.");
        return;
      }

      const position = await Location.getCurrentPositionAsync({});
      setCoords({ latitude: position.coords.latitude, longitude: position.coords.longitude });

      const [place] = await Location.reverseGeocodeAsync({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });

      if (place) {
        setAddressLine(place.street ?? addressLine);
        setNeighborhood(place.district ?? neighborhood);
        setCity(place.city ?? city);
        setState(place.region ?? state);
        setPostalCode(place.postalCode ?? postalCode);
      }
    } catch {
      Alert.alert("Erro", "Não foi possível obter sua localização agora.");
    } finally {
      setLocating(false);
    }
  }

  async function handleSave() {
    if (!session) return;
    if (!addressLine.trim()) {
      Alert.alert("Endereço obrigatório", "Informe ao menos a rua/avenida.");
      return;
    }

    setSaving(true);

    const { error } = await supabase.from("addresses").insert({
      customer_id: session.user.id,
      label: label || null,
      address_line: addressLine,
      number: number || null,
      complement: complement || null,
      neighborhood: neighborhood || null,
      city,
      state,
      postal_code: postalCode || null,
      is_default: isDefault,
      location: coords ? `POINT(${coords.longitude} ${coords.latitude})` : null,
    });

    setSaving(false);

    if (error) {
      Alert.alert("Erro ao salvar", error.message);
      return;
    }

    router.back();
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Pressable style={styles.locationButton} onPress={handleUseCurrentLocation} disabled={locating}>
        {locating ? (
          <ActivityIndicator />
        ) : (
          <Text style={styles.locationButtonText}>📍 Usar minha localização atual</Text>
        )}
      </Pressable>

      <TextInput style={styles.input} placeholder="Apelido (Casa, Trabalho...)" value={label} onChangeText={setLabel} />
      <TextInput
        style={styles.input}
        placeholder="Rua / Avenida"
        value={addressLine}
        onChangeText={setAddressLine}
      />
      <View style={styles.row}>
        <TextInput
          style={[styles.input, styles.flex1]}
          placeholder="Número"
          value={number}
          onChangeText={setNumber}
        />
        <TextInput
          style={[styles.input, styles.flex2]}
          placeholder="Complemento"
          value={complement}
          onChangeText={setComplement}
        />
      </View>
      <TextInput style={styles.input} placeholder="Bairro" value={neighborhood} onChangeText={setNeighborhood} />
      <View style={styles.row}>
        <TextInput style={[styles.input, styles.flex2]} placeholder="Cidade" value={city} onChangeText={setCity} />
        <TextInput style={[styles.input, styles.flex1]} placeholder="UF" value={state} onChangeText={setState} />
      </View>
      <TextInput style={styles.input} placeholder="CEP" value={postalCode} onChangeText={setPostalCode} />

      <View style={styles.switchRow}>
        <Text>Definir como padrão</Text>
        <Switch value={isDefault} onValueChange={setIsDefault} />
      </View>

      <Pressable style={styles.saveButton} onPress={handleSave} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Salvar endereço</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    gap: 12,
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  flex1: {
    flex: 1,
  },
  flex2: {
    flex: 2,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  locationButton: {
    borderWidth: 1,
    borderColor: "#000",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  locationButtonText: {
    fontWeight: "600",
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  saveButton: {
    backgroundColor: "#000",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 8,
  },
  saveButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
});
