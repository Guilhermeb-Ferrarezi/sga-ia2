import "dotenv/config";

const parsePort = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseNumber = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const optional = (value: string | undefined): string | undefined => {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
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
  apiPort: parsePort(Bun.env.PORT ?? Bun.env.API_PORT, 5000),
  apiBasePath: normalizeBasePath(Bun.env.API_BASE_PATH),
  webOrigin: Bun.env.WEB_ORIGIN ?? "http://localhost:5173",
  appName: Bun.env.APP_NAME ?? "WhatsApp AI Bot",
  webhookVerifyToken: required("WEBHOOK_VERIFY_TOKEN"),
  whatsappToken: required("WHATSAPP_TOKEN"),
  whatsappPhoneNumberId: required("WHATSAPP_PHONE_NUMBER_ID"),
  whatsappGraphVersion: Bun.env.WHATSAPP_GRAPH_VERSION ?? "v21.0",
  openaiApiKey: required("OPENAI_API_KEY"),
  openaiModel: Bun.env.OPENAI_MODEL ?? "gpt-4o-mini",
  openaiTranscriptionModel:
    Bun.env.OPENAI_TRANSCRIPTION_MODEL ?? "gpt-4o-mini-transcribe",
  assistantLanguage: Bun.env.ASSISTANT_LANGUAGE ?? "pt-BR",
  assistantPersonality:
    Bun.env.ASSISTANT_PERSONALITY ??
    "amigavel, profissional e confiante em esports",
  assistantStyle:
    Bun.env.ASSISTANT_STYLE ??
    "respostas curtas, objetivas e orientadas a acao",
  assistantSystemPrompt: optional(Bun.env.ASSISTANT_SYSTEM_PROMPT),
  redisUrl: optional(Bun.env.REDIS_URL),
  jwtSecret: Bun.env.JWT_SECRET ?? "dev-change-this-secret",
  jwtTtlSeconds: parseNumber(Bun.env.JWT_TTL_SECONDS, 60 * 60 * 24 * 7),
  adminEmail: optional(Bun.env.ADMIN_EMAIL),
  adminPassword: optional(Bun.env.ADMIN_PASSWORD),
  replyDelayPerCharMs: parseNumber(Bun.env.REPLY_DELAY_PER_CHAR_MS, 35),
  replyDelayMinMs: parseNumber(Bun.env.REPLY_DELAY_MIN_MS, 700),
  replyDelayMaxMs: parseNumber(Bun.env.REPLY_DELAY_MAX_MS, 7000),
  enableDb: Bun.env.ENABLE_DB === "true",
} as const;
