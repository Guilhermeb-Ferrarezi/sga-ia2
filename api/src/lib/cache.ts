import Redis from "ioredis";
import { config } from "../config";

let client: Redis | null = null;

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
};

const getClient = (): Redis | null => {
  if (!config.redisUrl) return null;
  if (client) return client;

  client = new Redis(config.redisUrl, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
  });

  client.on("error", (error: unknown) => {
    metrics.connected = false;
    console.warn("[redis] error", error);
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
  } catch {
    metrics.connected = false;
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
  enabled: Boolean(config.redisUrl),
});
