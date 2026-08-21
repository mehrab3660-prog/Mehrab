"use client";

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { api } from "@/lib/api";
import { Cart } from "@/lib/types";
import { useAuth } from "./AuthContext";

interface CartState {
  cart: Cart | null;
  loading: boolean;
  refresh: () => Promise<void>;
  addItem: (productId: string, quantity: number, productVariantId?: string, source?: "ai_advisor") => Promise<void>;
  updateItem: (itemId: string, quantity: number) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
}

const CartContext = createContext<CartState | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const { accessToken } = useAuth();
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!accessToken) {
      setCart(null);
      return;
    }
    setLoading(true);
    try {
      const data = await api.get<Cart>("/cart", accessToken);
      setCart(data);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addItem: CartState["addItem"] = async (productId, quantity, productVariantId, source) => {
    const data = await api.post<Cart>("/cart/items", { productId, quantity, productVariantId, source }, accessToken);
    setCart(data);
  };

  const updateItem: CartState["updateItem"] = async (itemId, quantity) => {
    const data = await api.patch<Cart>(`/cart/items/${itemId}`, { quantity }, accessToken);
    setCart(data);
  };

  const removeItem: CartState["removeItem"] = async (itemId) => {
    const data = await api.delete<Cart>(`/cart/items/${itemId}`, accessToken);
    setCart(data);
  };

  return (
    <CartContext.Provider value={{ cart, loading, refresh, addItem, updateItem, removeItem }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
