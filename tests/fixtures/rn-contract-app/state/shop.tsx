// The basket and who is signed in, kept in memory for the session.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { findProduct, PRODUCTS, type Product } from "@/data/catalogue";

export type BasketLine = { product: Product; quantity: number };

type Shop = {
  lines: BasketLine[];
  count: number;
  total: number;
  quantityOf: (id: string) => number;
  setQuantity: (id: string, quantity: number) => void;
  add: (id: string, quantity?: number) => void;
  clear: () => void;
  signedIn: boolean;
  signIn: () => void;
};

const ShopContext = createContext<Shop | null>(null);

// A regular's usual: the basket opens with what they bought last time.
const USUAL: Record<string, number> = { "oat-milk": 2, flatbread: 1 };

export function ShopProvider({ children }: { children: ReactNode }) {
  const [quantities, setQuantities] = useState<Record<string, number>>(USUAL);
  const [signedIn, setSignedIn] = useState(false);

  const setQuantity = useCallback((id: string, quantity: number) => {
    setQuantities((q) => {
      const next = { ...q };
      if (quantity > 0) next[id] = quantity;
      else delete next[id];
      return next;
    });
  }, []);

  const value = useMemo<Shop>(() => {
    const lines = Object.entries(quantities).flatMap(([id, quantity]) => {
      const product = findProduct(id);
      return product ? [{ product, quantity }] : [];
    });
    return {
      lines,
      count: lines.reduce((n, l) => n + l.quantity, 0),
      total: lines.reduce((sum, l) => sum + l.product.price * l.quantity, 0),
      quantityOf: (id) => quantities[id] ?? 0,
      setQuantity,
      add: (id, quantity = 1) => setQuantity(id, (quantities[id] ?? 0) + quantity),
      clear: () => setQuantities({}),
      signedIn,
      signIn: () => setSignedIn(true),
    };
  }, [quantities, setQuantity, signedIn]);

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export function useShop(): Shop {
  const shop = useContext(ShopContext);
  if (shop === null) throw new Error("useShop needs <ShopProvider> above it, in app/_layout.tsx.");
  return shop;
}

/** The shelves. They load at once from memory today; the screens still handle loading and failure for the real shop. */
export function useShelves(): { products: Product[] | undefined; failed: boolean; reload: () => void } {
  const [products, setProducts] = useState<Product[] | undefined>(PRODUCTS);
  const [failed, setFailed] = useState(false);
  const reload = useCallback(() => {
    setFailed(false);
    setProducts(PRODUCTS);
  }, []);
  return { products, failed, reload };
}
