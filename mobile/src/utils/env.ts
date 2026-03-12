import Constants from "expo-constants";

const extra = Constants.expoConfig?.extra ?? {};

export const ENV = {
  API_BASE: (extra.API_BASE as string) || "http://zap.santos-games.com/api",
  WS_BASE: (extra.WS_BASE as string) || "ws://192.168.1.100:3001/api",
} as const;
