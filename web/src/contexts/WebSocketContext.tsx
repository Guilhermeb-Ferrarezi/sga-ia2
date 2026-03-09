import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getWsUrl } from "@/lib/api";
import { useAuth } from "./AuthContext";

export type WsConnectionStatus = "connected" | "reconnecting" | "disconnected";

export interface WsEventPayload {
  type: string;
  payload: Record<string, unknown>;
  ts: number;
}

type WsHandler = (event: WsEventPayload) => void;

interface WsFilter {
  types?: string[];
  waId?: string | null;
  stageId?: number | null;
}

interface WebSocketContextValue {
  status: WsConnectionStatus;
  lastHeartbeat: number | null;
  subscribe: (handler: WsHandler) => () => void;
  subscribeFiltered: (handler: WsHandler, filter: WsFilter) => () => void;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [status, setStatus] = useState<WsConnectionStatus>("disconnected");
  const [lastHeartbeat, setLastHeartbeat] = useState<number | null>(null);
  const handlersRef = useRef<Set<WsHandler>>(new Set());
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dispatch = useCallback((event: WsEventPayload) => {
    for (const handler of handlersRef.current) {
      try {
        handler(event);
      } catch (err) {
        console.error("[ws] handler error", err);
      }
    }
  }, []);

  const connect = useCallback(() => {
    if (!token) return;

    const url = getWsUrl(token);
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      console.error("[ws] failed to create websocket", err);
      setStatus("disconnected");
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("connected");
      reconnectAttempt.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as WsEventPayload;
        if (data.type === "bot:heartbeat") {
          setLastHeartbeat(Date.now());
        }
        dispatch(data);
      } catch {
        /* malformed message */
      }
    };

    ws.onclose = () => {
      setStatus("reconnecting");
      wsRef.current = null;

      const delay = Math.min(
        RECONNECT_BASE_MS * 2 ** reconnectAttempt.current,
        RECONNECT_MAX_MS,
      );
      reconnectAttempt.current += 1;

      reconnectTimer.current = setTimeout(() => {
        connect();
      }, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [token, dispatch]);

  useEffect(() => {
    if (!token) {
      setStatus("disconnected");
      wsRef.current?.close();
      wsRef.current = null;
      return;
    }

    connect();

    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [token, connect]);

  const subscribe = useCallback((handler: WsHandler) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  const subscribeFiltered = useCallback(
    (handler: WsHandler, filter: WsFilter) => {
      const wrappedHandler: WsHandler = (event) => {
        if (filter.types && filter.types.length > 0 && !filter.types.includes(event.type)) {
          return;
        }
        const eventWaId = event.payload.waId ?? event.payload.phone;
        if (filter.waId && eventWaId && eventWaId !== filter.waId) {
          return;
        }
        if (
          filter.stageId != null &&
          event.payload.stageId != null &&
          event.payload.stageId !== filter.stageId
        ) {
          return;
        }
        handler(event);
      };
      handlersRef.current.add(wrappedHandler);
      return () => {
        handlersRef.current.delete(wrappedHandler);
      };
    },
    [],
  );

  return (
    <WebSocketContext.Provider value={{ status, lastHeartbeat, subscribe, subscribeFiltered }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket(): WebSocketContextValue {
  const ctx = useContext(WebSocketContext);
  if (!ctx) throw new Error("useWebSocket must be used within WebSocketProvider");
  return ctx;
}
