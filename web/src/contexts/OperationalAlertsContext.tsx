import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { useWebSocket, type WsEventPayload } from "@/contexts/WebSocketContext";
import { api, type OperationalAlertsSummary } from "@/lib/api";

interface OperationalAlertsContextValue {
  summary: OperationalAlertsSummary;
  refresh: () => Promise<void>;
}

const emptySummary: OperationalAlertsSummary = {
  overdueTasks: 0,
  pendingHandoffs: 0,
  criticalHandoffs: 0,
  updatedAt: new Date(0).toISOString(),
};

const OperationalAlertsContext = createContext<OperationalAlertsContextValue | null>(
  null,
);

const parseIncomingSummary = (
  payload: Record<string, unknown>,
): OperationalAlertsSummary | null => {
  const overdueTasks = Number(payload.overdueTasks);
  const pendingHandoffs = Number(payload.pendingHandoffs);
  const criticalHandoffs = Number(payload.criticalHandoffs);
  const updatedAt =
    typeof payload.updatedAt === "string"
      ? payload.updatedAt
      : new Date().toISOString();

  if (
    !Number.isFinite(overdueTasks) ||
    !Number.isFinite(pendingHandoffs) ||
    !Number.isFinite(criticalHandoffs)
  ) {
    return null;
  }

  return {
    overdueTasks,
    pendingHandoffs,
    criticalHandoffs,
    updatedAt,
  };
};

export function OperationalAlertsProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const { toast } = useToast();
  const { subscribe } = useWebSocket();
  const [summary, setSummary] = useState<OperationalAlertsSummary>(emptySummary);
  const previousRef = useRef<OperationalAlertsSummary | null>(null);

  const refresh = useCallback(async () => {
    if (!token) {
      setSummary(emptySummary);
      return;
    }
    try {
      const next = await api.alertsSummary(token);
      setSummary(next);
    } catch {
      /* ignore background refresh errors */
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    return subscribe((event: WsEventPayload) => {
      if (event.type !== "alerts:summary") return;
      const next = parseIncomingSummary(event.payload);
      if (!next) return;
      setSummary(next);
    });
  }, [subscribe]);

  useEffect(() => {
    const previous = previousRef.current;
    if (!previous) {
      previousRef.current = summary;
      return;
    }

    if (summary.criticalHandoffs > previous.criticalHandoffs) {
      toast({
        title: "Fila humana critica",
        description: `${summary.criticalHandoffs} contato(s) acima do SLA`,
        variant: "error",
      });
    }
    if (summary.overdueTasks > previous.overdueTasks) {
      toast({
        title: "Tarefas vencidas",
        description: `${summary.overdueTasks} tarefa(s) fora do prazo`,
        variant: "info",
      });
    }
    previousRef.current = summary;
  }, [summary, toast]);

  const value = useMemo<OperationalAlertsContextValue>(
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
  if (!ctx) {
    throw new Error(
      "useOperationalAlerts must be used within OperationalAlertsProvider",
    );
  }
  return ctx;
}
