import type { ServerWebSocket } from "bun";
import { jwtVerify } from "jose";

// ── Types ──────────────────────────────────────────────────────────

export interface WsEventPayload {
  type: string;
  payload: Record<string, unknown>;
  ts: number;
}

export interface WsUserData {
  userId: string;
  email: string;
}

// ── Registry ───────────────────────────────────────────────────────

const connections = new Map<string, Set<ServerWebSocket<WsUserData>>>();

export const registerConnection = (ws: ServerWebSocket<WsUserData>): void => {
  const { userId } = ws.data;
  let set = connections.get(userId);
  if (!set) {
    set = new Set();
    connections.set(userId, set);
  }
  set.add(ws);
  console.log(`[ws] user ${userId} connected (${set.size} tab(s))`);
};

export const unregisterConnection = (ws: ServerWebSocket<WsUserData>): void => {
  const { userId } = ws.data;
  const set = connections.get(userId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) connections.delete(userId);
  console.log(`[ws] user ${userId} disconnected`);
};

// ── Messaging helpers ──────────────────────────────────────────────

const buildMessage = (type: string, payload: Record<string, unknown>): string =>
  JSON.stringify({ type, payload, ts: Date.now() } satisfies WsEventPayload);

/** Broadcast an event to every connected client. */
export const broadcast = (type: string, payload: Record<string, unknown>): void => {
  const message = buildMessage(type, payload);
  let sent = 0;
  for (const set of connections.values()) {
    for (const ws of set) {
      try {
        ws.send(message);
        sent++;
      } catch {
        /* socket may have closed between iteration and send */
      }
    }
  }
  if (type !== "bot:heartbeat") {
    console.log(`[ws] broadcast ${type} to ${sent} client(s)`);
  }
};

/** Send an event to all tabs of a specific user. */
export const sendTo = (
  userId: string,
  type: string,
  payload: Record<string, unknown>,
): void => {
  const set = connections.get(userId);
  if (!set) return;
  const message = buildMessage(type, payload);
  for (const ws of set) {
    try {
      ws.send(message);
    } catch {
      /* ignore */
    }
  }
};

// ── Heartbeat ──────────────────────────────────────────────────────

let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

export const startHeartbeat = (intervalMs = 30_000): void => {
  if (heartbeatInterval) return;
  heartbeatInterval = setInterval(() => {
    broadcast("bot:heartbeat", { status: "alive" });
  }, intervalMs);
};

export const stopHeartbeat = (): void => {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
};

// ── Auth helper (validates JWT from query param) ───────────────────

export const verifyWsToken = async (
  token: string,
  jwtSecret: string,
): Promise<WsUserData | null> => {
  try {
    const secretKey = new TextEncoder().encode(jwtSecret);
    const { payload } = await jwtVerify(token, secretKey, {
      algorithms: ["HS256"],
    });
    const userId = payload.sub;
    const email = (payload as Record<string, unknown>).email;
    if (!userId || typeof email !== "string") return null;
    return { userId, email };
  } catch {
    return null;
  }
};
