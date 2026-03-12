import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const TOKEN_KEY = "esports_ia_token";

// expo-secure-store is not available on web — fall back to localStorage
const isWeb = Platform.OS === "web";

export const tokenStorage = {
  async get(): Promise<string | null> {
    if (isWeb) {
      return typeof localStorage !== "undefined"
        ? localStorage.getItem(TOKEN_KEY)
        : null;
    }
    return SecureStore.getItemAsync(TOKEN_KEY);
  },

  async set(token: string): Promise<void> {
    if (isWeb) {
      if (typeof localStorage !== "undefined") localStorage.setItem(TOKEN_KEY, token);
      return;
    }
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  },

  async clear(): Promise<void> {
    if (isWeb) {
      if (typeof localStorage !== "undefined") localStorage.removeItem(TOKEN_KEY);
      return;
    }
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  },
};
