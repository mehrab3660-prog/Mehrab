"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useToast } from "./ToastContext";

const STORAGE_KEY = "sn_compare_list";
const MAX_ITEMS = 4;

interface CompareState {
  ids: string[];
  isComparing: (productId: string) => boolean;
  toggle: (productId: string) => void;
  clear: () => void;
}

const CompareContext = createContext<CompareState | undefined>(undefined);

function readStorage(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function CompareProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<string[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    setIds(readStorage());
  }, []);

  function persist(next: string[]) {
    setIds(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function toggle(productId: string) {
    if (ids.includes(productId)) {
      persist(ids.filter((id) => id !== productId));
      return;
    }
    if (ids.length >= MAX_ITEMS) {
      toast(`حداکثر ${MAX_ITEMS} محصول را می‌توانید مقایسه کنید.`, "info");
      return;
    }
    persist([...ids, productId]);
  }

  function clear() {
    persist([]);
  }

  const isComparing = (productId: string) => ids.includes(productId);

  return <CompareContext.Provider value={{ ids, isComparing, toggle, clear }}>{children}</CompareContext.Provider>;
}

export function useCompare() {
  const ctx = useContext(CompareContext);
  if (!ctx) throw new Error("useCompare must be used within CompareProvider");
  return ctx;
}
