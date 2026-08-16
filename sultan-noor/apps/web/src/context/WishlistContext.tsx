"use client";

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { api } from "@/lib/api";
import { useAuth } from "./AuthContext";

interface WishlistItem {
  id: string;
  productId: string;
}

interface WishlistState {
  itemIds: Set<string>;
  loading: boolean;
  toggle: (productId: string) => Promise<void>;
}

const WishlistContext = createContext<WishlistState | undefined>(undefined);

export function WishlistProvider({ children }: { children: ReactNode }) {
  const { accessToken } = useAuth();
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!accessToken) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const res = await api.get<{ items: WishlistItem[] }>("/wishlist", accessToken);
      setItems(res.items);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const toggle = async (productId: string) => {
    if (!accessToken) return;
    const existing = items.find((i) => i.productId === productId);
    if (existing) {
      const updated = await api.delete<{ items: WishlistItem[] }>(`/wishlist/items/${existing.id}`, accessToken);
      setItems(updated.items);
    } else {
      const updated = await api.post<{ items: WishlistItem[] }>("/wishlist/items", { productId }, accessToken);
      setItems(updated.items);
    }
  };

  const itemIds = new Set(items.map((i) => i.productId));

  return <WishlistContext.Provider value={{ itemIds, loading, toggle }}>{children}</WishlistContext.Provider>;
}

export function useWishlist() {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error("useWishlist must be used within WishlistProvider");
  return ctx;
}
