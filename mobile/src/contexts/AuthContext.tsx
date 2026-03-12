import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { tokenStorage } from "@/services/storage/tokenStorage";
import type { AuthUser, LoginResponse } from "@/types";
import { ENV } from "@/utils/env";

interface AuthContextValue {
  token: string | null;
  user: AuthUser | null;
  bootLoading: boolean;
  authLoading: boolean;
  authError: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [bootLoading, setBootLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const logout = useCallback(async () => {
    await tokenStorage.clear();
    setToken(null);
    setUser(null);
  }, []);

  // Bootstrap: load stored token and validate session
  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        const storedToken = await tokenStorage.get();
        if (!storedToken) return;

        const res = await fetch(`${ENV.API_BASE}/auth/me`, {
          headers: { Authorization: `Bearer ${storedToken}` },
        });
        if (!res.ok) throw new Error("Invalid session");
        const data = (await res.json()) as { user: AuthUser };
        if (cancelled) return;
        setToken(storedToken);
        setUser(data.user);
      } catch {
        if (!cancelled) await tokenStorage.clear();
      } finally {
        if (!cancelled) setBootLoading(false);
      }
    };

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const res = await fetch(`${ENV.API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? "Não foi possível autenticar");
      }
      const session = data as LoginResponse;
      await tokenStorage.set(session.token);
      setToken(session.token);
      setUser(session.user);
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : "Não foi possível autenticar",
      );
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      bootLoading,
      authLoading,
      authError,
      login,
      logout,
    }),
    [token, user, bootLoading, authLoading, authError, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
