import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { supabase } from "../../src/lib/supabase";
import { useCart } from "../../src/context/cart";
import type { CatalogBrowseRow } from "../../src/lib/types";

type Category = { id: string; name: string };

function formatPrice(cents: number | null): string {
  if (cents === null) return "Indisponível";
  return `A partir de R$ ${(cents / 100).toFixed(2)}`;
}

export default function CatalogScreen() {
  const { addItem } = useCart();
  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [rows, setRows] = useState<CatalogBrowseRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("categories")
      .select("id, name")
      .order("sort_order")
      .then(({ data }) => setCategories(data ?? []));
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setLoading(true);
      let request = supabase.from("catalog_browse").select("*").order("name");

      if (query.trim()) {
        request = request.ilike("name", `%${query.trim()}%`);
      }
      if (selectedCategory) {
        request = request.eq("category_id", selectedCategory);
      }

      request.then(({ data }) => {
        setRows(data ?? []);
        setLoading(false);
      });
    }, 300);

    return () => clearTimeout(timeout);
  }, [query, selectedCategory]);

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.search}
        placeholder="Buscar produto (ex: Heineken)"
        value={query}
        onChangeText={setQuery}
      />

      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={categories}
        keyExtractor={(item) => item.id}
        style={styles.categoryList}
        renderItem={({ item }) => (
          <Pressable
            style={[styles.chip, selectedCategory === item.id && styles.chipActive]}
            onPress={() => setSelectedCategory((current) => (current === item.id ? null : item.id))}
          >
            <Text style={[styles.chipText, selectedCategory === item.id && styles.chipTextActive]}>
              {item.name}
            </Text>
          </Pressable>
        )}
      />

      {loading ? (
        <ActivityIndicator style={styles.loading} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.catalog_product_id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>Nenhum produto encontrado.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardInfo}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                {item.brand && <Text style={styles.cardBrand}>{item.brand}</Text>}
                <Text style={item.in_stock ? styles.price : styles.priceUnavailable}>
                  {item.in_stock ? formatPrice(item.min_price_cents) : "Sem estoque no momento"}
                </Text>
              </View>
              <Pressable
                style={[styles.addButton, !item.in_stock && styles.addButtonDisabled]}
                disabled={!item.in_stock}
                onPress={() =>
                  addItem({
                    catalogProductId: item.catalog_product_id,
                    name: item.name,
                    indicativePriceCents: item.min_price_cents,
                  })
                }
              >
                <Text style={styles.addButtonText}>+</Text>
              </Pressable>
            </View>
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
  search: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  categoryList: {
    flexGrow: 0,
  },
  chip: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
  },
  chipActive: {
    backgroundColor: "#000",
    borderColor: "#000",
  },
  chipText: {
    fontSize: 13,
  },
  chipTextActive: {
    color: "#fff",
  },
  loading: {
    marginTop: 24,
  },
  list: {
    gap: 8,
    paddingBottom: 24,
  },
  empty: {
    textAlign: "center",
    color: "#666",
    marginTop: 24,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 10,
    padding: 12,
  },
  cardInfo: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  cardBrand: {
    fontSize: 12,
    color: "#666",
  },
  price: {
    fontSize: 14,
    color: "#000",
    marginTop: 4,
  },
  priceUnavailable: {
    fontSize: 13,
    color: "#999",
    marginTop: 4,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },
  addButtonDisabled: {
    backgroundColor: "#ccc",
  },
  addButtonText: {
    color: "#fff",
    fontSize: 20,
    lineHeight: 22,
  },
});
