import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  api,
  sessionStore,
  type AuthUser,
} from "@/lib/api";

interface AuthContextValue {
  token: string | null;
  user: AuthUser | null;
  bootLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  authLoading: boolean;
  authError: string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => sessionStore.get());
  const [user, setUser] = useState<AuthUser | null>(null);
  const [bootLoading, setBootLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const logout = useCallback(() => {
    sessionStore.clear();
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      if (!token) {
        setBootLoading(false);
        return;
      }

      try {
        const me = await api.me(token);
        if (cancelled) return;
        setUser(me.user);
      } catch {
        if (cancelled) return;
        logout();
      } finally {
        if (!cancelled) setBootLoading(false);
      }
    };

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [token, logout]);

  const login = useCallback(
    async (email: string, password: string) => {
      setAuthLoading(true);
      setAuthError(null);
      try {
        const session = await api.login(email, password);
        sessionStore.set(session.token);
        setToken(session.token);
        setUser(session.user);
      } catch (error) {
        setAuthError(
          error instanceof Error ? error.message : "Nao foi possivel autenticar",
        );
      } finally {
        setAuthLoading(false);
      }
    },
    [],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      bootLoading,
      login,
      logout,
      authLoading,
      authError,
    }),
    [token, user, bootLoading, login, logout, authLoading, authError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
