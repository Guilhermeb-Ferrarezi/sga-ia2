import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./AuthContext";
import { useWebSocket } from "./WebSocketContext";
import type { OperationalAlertsSummary } from "@/types";
import { ENV } from "@/utils/env";

interface OperationalAlertsContextValue {
  summary: OperationalAlertsSummary;
  refresh: () => Promise<void>;
}

const DEFAULT_SUMMARY: OperationalAlertsSummary = {
  overdueTasks: 0,
  pendingHandoffs: 0,
  criticalHandoffs: 0,
  updatedAt: new Date().toISOString(),
};

const OperationalAlertsContext =
  createContext<OperationalAlertsContextValue | null>(null);

export function OperationalAlertsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { token } = useAuth();
  const { subscribe } = useWebSocket();
  const [summary, setSummary] =
    useState<OperationalAlertsSummary>(DEFAULT_SUMMARY);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${ENV.API_BASE}/dashboard/alerts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = (await res.json()) as OperationalAlertsSummary;
        setSummary(data);
      }
    } catch {
      /* silent */
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    return subscribe((event) => {
      if (event.type === "alerts:summary") {
        setSummary(event.payload as unknown as OperationalAlertsSummary);
      }
    });
  }, [subscribe]);

  const value = useMemo(
    () => ({ summary, refresh }),
    [summary, refresh],
  );

  return (
    <OperationalAlertsContext.Provider value={value}>
      {children}
    </OperationalAlertsContext.Provider>
  );
}

export function useOperationalAlerts(): OperationalAlertsContextValue {
  const ctx = useContext(OperationalAlertsContext);
  if (!ctx)
    throw new Error(
      "useOperationalAlerts must be used inside OperationalAlertsProvider",
    );
  return ctx;
}
