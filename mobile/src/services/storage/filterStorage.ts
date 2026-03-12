import AsyncStorage from "@react-native-async-storage/async-storage";

const FILTERS_PREFIX = "filters:";

export const filterStorage = {
  async get(pageKey: string, userId: string): Promise<Record<string, unknown>> {
    const key = `${FILTERS_PREFIX}${userId}:${pageKey}`;
    const stored = await AsyncStorage.getItem(key);
    return stored ? JSON.parse(stored) : {};
  },

  async set(
    pageKey: string,
    userId: string,
    filters: Record<string, unknown>,
  ): Promise<void> {
    const key = `${FILTERS_PREFIX}${userId}:${pageKey}`;
    await AsyncStorage.setItem(key, JSON.stringify(filters));
  },

  async clear(pageKey: string, userId: string): Promise<void> {
    const key = `${FILTERS_PREFIX}${userId}:${pageKey}`;
    await AsyncStorage.removeItem(key);
  },
};
