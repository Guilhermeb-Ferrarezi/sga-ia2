import Constants from "expo-constants";

const extra = Constants.expoConfig?.extra ?? {};

const apiBase =
  (extra.API_BASE as string) || "https://zap.santos-games.com/api";
const derivedWsBase = apiBase
  .replace(/^https:/, "wss:")
  .replace(/^http:/, "ws:");

export const ENV = {
  API_BASE: apiBase,
  WS_BASE: (extra.WS_BASE as string) || derivedWsBase,
} as const;
