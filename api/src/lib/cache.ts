import Redis from "ioredis";
import { config } from "../config";

let client: Redis | null = null;
let runtimeDisabled = false;
let disabledReason: string | null = null;

type CacheMetrics = {
  enabled: boolean;
  connected: boolean;
  hits: number;
  misses: number;
  getErrors: number;
  sets: number;
  setErrors: number;
  invalidations: number;
  invalidationErrors: number;
  keysDeleted: number;
  lastInvalidatedAt: string | null;
  disabledReason: string | null;
};

const metrics: CacheMetrics = {
  enabled: Boolean(config.redisUrl),
  connected: false,
  hits: 0,
  misses: 0,
  getErrors: 0,
  sets: 0,
  setErrors: 0,
  invalidations: 0,
  invalidationErrors: 0,
  keysDeleted: 0,
  lastInvalidatedAt: null,
  disabledReason: null,
};

const getErrorCode = (error: unknown): string | undefined => {
  if (!error || typeof error !== "object") return undefined;
  const code = Reflect.get(error, "code");
  return typeof code === "string" ? code : undefined;
};

const getErrorMessage = (error: unknown): string | undefined => {
  if (!error || typeof error !== "object") return undefined;
  const message = Reflect.get(error, "message");
  return typeof message === "string" ? message : undefined;
};

const disableRuntimeCache = (reason: string): void => {
  if (runtimeDisabled) return;

  runtimeDisabled = true;
  disabledReason = reason;
  metrics.connected = false;
  metrics.disabledReason = reason;

  if (client) {
    client.removeAllListeners();
    client.disconnect();
    client = null;
  }

  console.warn(`[redis] cache disabled: ${reason}`);
};

const handleRedisFailure = (error: unknown): void => {
  const code = getErrorCode(error);
  const message = getErrorMessage(error) ?? "Unknown Redis error";

  if (code === "ENOTFOUND" || code === "EAI_AGAIN" || code === "ECONNREFUSED") {
    disableRuntimeCache(`${code}: ${message}`);
    return;
  }

  console.warn("[redis] error", error);
};

const getClient = (): Redis | null => {
  if (!config.redisUrl || runtimeDisabled) return null;
  if (client) return client;

  client = new Redis(config.redisUrl, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
  });

  client.on("error", (error: unknown) => {
    metrics.connected = false;
    handleRedisFailure(error);
  });

  client.on("connect", () => {
    metrics.connected = true;
  });

  client.on("close", () => {
    metrics.connected = false;
  });

  return client;
};

const ensureConnected = async (redis: Redis): Promise<boolean> => {
  try {
    if (redis.status === "wait") {
      await redis.connect();
    }
    const connected = redis.status === "ready" || redis.status === "connect";
    metrics.connected = connected;
    return connected;
  } catch (error) {
    metrics.connected = false;
    handleRedisFailure(error);
    return false;
  }
};

export const cacheGetJson = async <T>(key: string): Promise<T | null> => {
  const redis = getClient();
  if (!redis) {
    metrics.misses += 1;
    return null;
  }

  const connected = await ensureConnected(redis);
  if (!connected) {
    metrics.misses += 1;
    return null;
  }

  try {
    const raw = await redis.get(key);
    if (!raw) {
      metrics.misses += 1;
      return null;
    }
    metrics.hits += 1;
    return JSON.parse(raw) as T;
  } catch {
    metrics.getErrors += 1;
    metrics.misses += 1;
    return null;
  }
};

export const cacheSetJson = async (
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> => {
  const redis = getClient();
  if (!redis) return;

  const connected = await ensureConnected(redis);
  if (!connected) return;

  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
    metrics.sets += 1;
  } catch {
    metrics.setErrors += 1;
    /* ignore cache write errors */
  }
};

export const cacheDeleteByPrefix = async (prefix: string): Promise<void> => {
  const redis = getClient();
  if (!redis) return;

  const connected = await ensureConnected(redis);
  if (!connected) return;

  try {
    let deletedCount = 0;
    let cursor = "0";
    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        "MATCH",
        `${prefix}*`,
        "COUNT",
        100,
      );
      cursor = nextCursor;
      if (keys.length) {
        const deleted = await redis.del(keys);
        deletedCount += deleted;
      }
    } while (cursor !== "0");

    metrics.invalidations += 1;
    metrics.keysDeleted += deletedCount;
    metrics.lastInvalidatedAt = new Date().toISOString();
  } catch {
    metrics.invalidationErrors += 1;
    /* ignore cache invalidation errors */
  }
};

export const getCacheMetrics = (): CacheMetrics => ({
  ...metrics,
  enabled: Boolean(config.redisUrl) && !runtimeDisabled,
  disabledReason,
});
