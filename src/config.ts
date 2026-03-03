import "dotenv/config";

const parsePort = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const required = (name: string): string => {
  const value = Bun.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
};

const normalizeBasePath = (value: string | undefined): string => {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "/") return "/api";
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.endsWith("/")
    ? withLeadingSlash.slice(0, -1)
    : withLeadingSlash;
};

export const config = {
  apiPort: parsePort(Bun.env.API_PORT ?? Bun.env.PORT, 5000),
  apiBasePath: normalizeBasePath(Bun.env.API_BASE_PATH),
  appName: Bun.env.APP_NAME ?? "WhatsApp AI Bot",
  webhookVerifyToken: required("WEBHOOK_VERIFY_TOKEN"),
  whatsappToken: required("WHATSAPP_TOKEN"),
  whatsappPhoneNumberId: required("WHATSAPP_PHONE_NUMBER_ID"),
  whatsappGraphVersion: Bun.env.WHATSAPP_GRAPH_VERSION ?? "v21.0",
  openaiApiKey: required("OPENAI_API_KEY"),
  openaiModel: Bun.env.OPENAI_MODEL ?? "gpt-4o-mini",
  enableDb: Bun.env.ENABLE_DB === "true",
} as const;
