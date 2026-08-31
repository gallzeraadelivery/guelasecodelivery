import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type CartItem = {
  catalogProductId: string;
  name: string;
  indicativePriceCents: number | null;
  quantity: number;
};

type CartContextValue = {
  items: CartItem[];
  totalItems: number;
  addItem: (item: Omit<CartItem, "quantity">) => void;
  removeItem: (catalogProductId: string) => void;
  setQuantity: (catalogProductId: string, quantity: number) => void;
  clear: () => void;
};

const STORAGE_KEY = "guela-seco:cart";

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try {
          setItems(JSON.parse(raw) as CartItem[]);
        } catch {
          // dado corrompido — carrinho começa vazio.
        }
      }
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, hydrated]);

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      totalItems: items.reduce((sum, item) => sum + item.quantity, 0),
      addItem: (item) => {
        setItems((current) => {
          const existing = current.find((i) => i.catalogProductId === item.catalogProductId);
          if (existing) {
            return current.map((i) =>
              i.catalogProductId === item.catalogProductId ? { ...i, quantity: i.quantity + 1 } : i,
            );
          }
          return [...current, { ...item, quantity: 1 }];
        });
      },
      removeItem: (catalogProductId) => {
        setItems((current) => current.filter((i) => i.catalogProductId !== catalogProductId));
      },
      setQuantity: (catalogProductId, quantity) => {
        setItems((current) => {
          if (quantity <= 0) return current.filter((i) => i.catalogProductId !== catalogProductId);
          return current.map((i) => (i.catalogProductId === catalogProductId ? { ...i, quantity } : i));
        });
      },
      clear: () => setItems([]),
    }),
    [items],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart deve ser usado dentro de CartProvider");
  return ctx;
}
