"use client";

import { createContext, useContext, useEffect, useRef, useState, ReactNode, useCallback } from "react";
import { api } from "@/lib/api";
import { AuthUser } from "@/lib/types";

// Matches the API's access-token TTL (15m, see apps/api/src/auth/auth.service.ts) —
// there's no silent refresh, so a token this old would fail on the next request
// anyway. Logging the user out on the same schedule turns that into a clean,
// predictable session instead of a confusing "logged in but every action fails".
const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const ACTIVITY_EVENTS = ["mousedown", "keydown", "touchstart", "scroll"] as const;

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  loading: boolean;
  requestOtp: (phone: string, purpose: "LOGIN" | "REGISTER") => Promise<void>;
  verifyOtp: (params: {
    phone: string;
    code: string;
    purpose: "LOGIN" | "REGISTER";
    fullName?: string;
    customerType?: "RETAIL" | "WHOLESALE";
  }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("sn_access_token");
    const rawUser = localStorage.getItem("sn_user");
    if (token && rawUser) {
      setAccessToken(token);
      setUser(JSON.parse(rawUser));
    }
    setLoading(false);
  }, []);

  const persist = useCallback((token: string, authUser: AuthUser, refreshToken: string) => {
    localStorage.setItem("sn_access_token", token);
    localStorage.setItem("sn_refresh_token", refreshToken);
    localStorage.setItem("sn_user", JSON.stringify(authUser));
    setAccessToken(token);
    setUser(authUser);
  }, []);

  const requestOtp: AuthState["requestOtp"] = async (phone, purpose) => {
    await api.post("/auth/otp/request", { phone, purpose });
  };

  const verifyOtp: AuthState["verifyOtp"] = async (params) => {
    const res = await api.post<{ accessToken: string; refreshToken: string; user: AuthUser }>("/auth/otp/verify", params);
    persist(res.accessToken, res.user, res.refreshToken);
  };

  const logout = useCallback(() => {
    localStorage.removeItem("sn_access_token");
    localStorage.removeItem("sn_refresh_token");
    localStorage.removeItem("sn_user");
    setAccessToken(null);
    setUser(null);
  }, []);

  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!accessToken) return;

    const resetIdleTimer = () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(logout, IDLE_TIMEOUT_MS);
    };

    resetIdleTimer();
    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, resetIdleTimer));

    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, resetIdleTimer));
    };
  }, [accessToken, logout]);

  return (
    <AuthContext.Provider value={{ user, accessToken, loading, requestOtp, verifyOtp, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
