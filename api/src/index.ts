import { config } from "./config";
import {
  cacheDeleteByPrefix,
  cacheGetJson,
  cacheSetJson,
  getCacheMetrics,
} from "./lib/cache";
import {
  buildImageMessageBody,
  extractImageMessageUrls,
  sanitizeMessageBodyForAi,
  sanitizeMessageBodyForPreview,
} from "./lib/messageContent";
import { getPrismaClient } from "./lib/prisma";
import {
  Prisma,
  type ContactChannel,
  type PrismaClient,
  type UserRole,
} from "@prisma/client";
import { SignJWT, jwtVerify } from "jose";
import { AuthService } from "./services/auth";
import { toPublicUser, type PublicUser } from "./services/auth";
import { DashboardService } from "./services/dashboard";
import {
  extractInstagramInboundMessages,
  InstagramApiError,
  InstagramService,
} from "./services/instagram";
import { OpenAIService } from "./services/openai";
import { buildOpenApiDocument, renderSwaggerUiHtml } from "./services/swagger";
import {
  resolveAiSettings,
  saveAiSettings,
  type AiSettingsInput,
} from "./services/aiSettings";
import {
  extractInboundMessages,
  isWhatsAppPermissionError,
  WhatsAppApiError,
  WhatsAppService,
} from "./services/whatsapp";
import type {
  InstagramInboundMessage,
  InstagramWebhookPayload,
} from "./types/instagram";
import type { InboundMessage, WhatsAppWebhookPayload } from "./types/whatsapp";
import {
  HANDOFF_CRITICAL_MINUTES,
  classifyHandoffSla,
  computeHandoffWaitMinutes,
} from "./lib/operationalAlerts";
import {
  uploadToR2,
  uploadFileToR2,
  deleteFromR2,
  getObjectFromR2,
  getStreamFromR2,
} from "./services/r2";
import {
  broadcast,
  registerConnection,
  sendTo,
  startHeartbeat,
  stopHeartbeat,
  unregisterConnection,
  verifyWsToken,
  type WsUserData,
} from "./lib/ws";
import {
  ALL_PERMISSIONS,
  PERMISSIONS,
  hasPermission,
  normalizePermissionList,
  type Permission,
} from "./services/rbac";

const openAI = new OpenAIService(
  config.openaiApiKey,
  config.appName,
  config.openaiTranscriptionModel,
);
const auth = new AuthService({
  jwtSecret: config.jwtSecret,
  jwtTtlSeconds: config.jwtTtlSeconds,
  adminEmail: config.adminEmail,
  adminPassword: config.adminPassword,
});
const dashboard = new DashboardService();
let contactAuditLogAvailable = true;

const isPrismaMissingTableError = (error: unknown, tableName: string): boolean => {
  if (!error || typeof error !== "object") return false;

  const code = Reflect.get(error, "code");
  if (code !== "P2021") return false;

  const meta = Reflect.get(error, "meta");
  if (!meta || typeof meta !== "object") return false;

  const table = Reflect.get(meta, "table");
  return table === tableName;
};

const disableContactAuditLog = (reason: string): void => {
  if (!contactAuditLogAvailable) return;
  contactAuditLogAvailable = false;
  console.warn(`[contact-audit] disabled: ${reason}`);
};

const whatsapp = new WhatsAppService(
  config.whatsappToken,
  config.whatsappPhoneNumberId,
  config.whatsappGraphVersion,
  config.whatsappAppId,
);
const instagram = new InstagramService(
  config.metaGraphVersion,
  config.instagramAppId,
  config.instagramAppSecret,
  config.metaRedirectUri,
);

const logWhatsAppPermissionHint = (error: unknown): void => {
  if (!isWhatsAppPermissionError(error)) return;
  console.error(
    "[whatsapp-auth] Meta rejected the token/permissions. Check WHATSAPP_TOKEN, ensure it is a permanent System User token with whatsapp_business_messaging and whatsapp_business_management permissions, confirm the app is attached to the correct WhatsApp Business Account, and verify WHATSAPP_PHONE_NUMBER_ID.",
  );
};

const CORS_METHODS = "GET,POST,PUT,DELETE,OPTIONS";
const VALID_PRESET_USER_ROLES = new Set<UserRole>([
  "ADMIN",
  "MANAGER",
  "AGENT",
  "VIEWER",
]);

// Returns the echoed request origin when it is in the allow-list,
// or the first configured origin as a safe fallback.
const resolveAllowOrigin = (req?: Request): string => {
  const origin = req?.headers.get("origin");
  if (!origin) return config.allowedOrigins[0] ?? "*";
  const wildcardAllowed = config.allowedOrigins.includes("*");
  return wildcardAllowed || config.allowedOrigins.includes(origin)
    ? origin
    : (config.allowedOrigins[0] ?? origin);
};

const json = (body: unknown, status = 200, req?: Request): Response => {
  const allowOrigin = resolveAllowOrigin(req);

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": allowOrigin,
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": CORS_METHODS,
      Vary: "Origin",
    },
  });
};

const textResponse = (
  body: string,
  status = 200,
  req?: Request,
  contentType = "text/plain",
): Response => {
  const allowOrigin = resolveAllowOrigin(req);

  return new Response(body, {
    status,
    headers: {
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": allowOrigin,
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": CORS_METHODS,
      Vary: "Origin",
    },
  });
};

const healthPaths = new Set<string>([
  `${config.apiBasePath}/health`,
  "/health",
  "/",
]);
const legacyWebhookPaths = new Set<string>([
  `${config.apiBasePath}/webhook`,
  "/webhook",
]);
const whatsappWebhookPaths = new Set<string>([
  `${config.apiBasePath}/webhook/whatsapp`,
  "/webhook/whatsapp",
]);
const instagramWebhookPaths = new Set<string>([
  `${config.apiBasePath}/webhook/instagram`,
  "/webhook/instagram",
]);
const authLoginPaths = new Set<string>([
  `${config.apiBasePath}/auth/login`,
  "/auth/login",
]);
const authMePaths = new Set<string>([
  `${config.apiBasePath}/auth/me`,
  "/auth/me",
]);
const openApiJsonPaths = new Set<string>([
  `${config.apiBasePath}/openapi.json`,
  "/openapi.json",
]);
const swaggerUiPaths = new Set<string>([
  `${config.apiBasePath}/swagger`,
  "/swagger",
]);
const authProfilePaths = new Set<string>([
  `${config.apiBasePath}/auth/profile`,
  "/auth/profile",
]);
const dashboardOverviewPaths = new Set<string>([
  `${config.apiBasePath}/dashboard/overview`,
  "/dashboard/overview",
]);
const dashboardAlertsPaths = new Set<string>([
  `${config.apiBasePath}/dashboard/alerts`,
  "/dashboard/alerts",
]);
const dashboardConversationsPaths = new Set<string>([
  `${config.apiBasePath}/dashboard/conversations`,
  "/dashboard/conversations",
]);
const dashboardCacheMetricsPaths = new Set<string>([
  `${config.apiBasePath}/dashboard/cache/metrics`,
  "/dashboard/cache/metrics",
]);
const funnelMetricsPaths = new Set<string>([
  `${config.apiBasePath}/pipeline/funnel`,
  "/pipeline/funnel",
]);
const dashboardConversationTurnsPrefix = [
  `${config.apiBasePath}/dashboard/conversations/`,
  "/dashboard/conversations/",
];

// ── Phase 2 route paths ──────────────────────────────────────────
const pipelineStagesPaths = new Set<string>([
  `${config.apiBasePath}/pipeline/stages`,
  "/pipeline/stages",
]);
const pipelineStagesReorderPaths = new Set<string>([
  `${config.apiBasePath}/pipeline/stages/reorder`,
  "/pipeline/stages/reorder",
]);
const pipelineStagesPrefix = [
  `${config.apiBasePath}/pipeline/stages/`,
  "/pipeline/stages/",
];
const pipelineBoardPaths = new Set<string>([
  `${config.apiBasePath}/pipeline/board`,
  "/pipeline/board",
]);
const pipelineBoardColumnPaths = new Set<string>([
  `${config.apiBasePath}/pipeline/board/column`,
  "/pipeline/board/column",
]);
const contactsPaths = new Set<string>([
  `${config.apiBasePath}/contacts`,
  "/contacts",
]);
const contactsBatchPaths = new Set<string>([
  `${config.apiBasePath}/contacts/batch`,
  "/contacts/batch",
]);
const contactsPrefix = [
  `${config.apiBasePath}/contacts/`,
  "/contacts/",
];
const faqPaths = new Set<string>([
  `${config.apiBasePath}/faqs`,
  "/faqs",
]);
const faqPrefix = [
  `${config.apiBasePath}/faqs/`,
  "/faqs/",
];
const templatePaths = new Set<string>([
  `${config.apiBasePath}/templates`,
  "/templates",
]);
const templatePrefix = [
  `${config.apiBasePath}/templates/`,
  "/templates/",
];
const tagPaths = new Set<string>([
  `${config.apiBasePath}/tags`,
  "/tags",
]);
const tagPrefix = [
  `${config.apiBasePath}/tags/`,
  "/tags/",
];
const taskPaths = new Set<string>([
  `${config.apiBasePath}/tasks`,
  "/tasks",
]);
const taskPrefix = [
  `${config.apiBasePath}/tasks/`,
  "/tasks/",
];
const usersPaths = new Set<string>([
  `${config.apiBasePath}/users`,
  "/users",
]);
const usersPrefix = [
  `${config.apiBasePath}/users/`,
  "/users/",
];
const rolesPaths = new Set<string>([
  `${config.apiBasePath}/roles`,
  "/roles",
]);
const rolesPrefix = [
  `${config.apiBasePath}/roles/`,
  "/roles/",
];
const handoffQueuePaths = new Set<string>([
  `${config.apiBasePath}/handoff/queue`,
  "/handoff/queue",
]);
const handoffQueuePrefix = [
  `${config.apiBasePath}/handoff/queue/`,
  "/handoff/queue/",
];
const audioPaths = new Set<string>([
  `${config.apiBasePath}/audios`,
  "/audios",
]);
const audioPrefix = [
  `${config.apiBasePath}/audios/`,
  "/audios/",
];
const whatsappProfilePaths = new Set<string>([
  `${config.apiBasePath}/whatsapp/profile`,
  "/whatsapp/profile",
]);
const instagramConnectionsPaths = new Set<string>([
  `${config.apiBasePath}/instagram/connections`,
  "/instagram/connections",
]);
const instagramOauthStartPaths = new Set<string>([
  `${config.apiBasePath}/instagram/oauth/start`,
  "/instagram/oauth/start",
]);
const instagramOauthCallbackPaths = new Set<string>([
  `${config.apiBasePath}/instagram/oauth/callback`,
  "/instagram/oauth/callback",
]);
const instagramConnectionsPrefix = [
  `${config.apiBasePath}/instagram/connections/`,
  "/instagram/connections/",
];
const aiSettingsPaths = new Set<string>([
  `${config.apiBasePath}/settings/ai`,
  "/settings/ai",
]);
const wsUpgradePaths = new Set<string>([
  `${config.apiBasePath}/ws`,
  "/ws",
]);

const processedMessageIds = new Map<string, number>();
const resumedBotReplyLocks = new Set<string>();
const MESSAGE_ID_TTL_MS = 10 * 60 * 1000;
const MAX_RESUME_PENDING_MESSAGES = 10;
const MAX_RESUME_PENDING_CONTEXT_CHARS = 4000;
const HUMAN_HANDOFF_REGEX =
  /\b(atendente|humano|pessoa real|suporte humano|falar com alguem|falar com pessoa|time de atendimento)\b/i;
const HANDOFF_CONFIRMATION_REPLY_REGEX =
  /^(sim|s|ok|okay|claro|claro que sim|pode|pode sim|pode ser|quero sim|isso|isso mesmo|confirmo|confirmado|blz|beleza|fechado|por favor|favor)$/i;
const HANDOFF_OFFER_MESSAGE_REGEX =
  /\b(quer que eu encaminhe|quer que eu passe|posso encaminhar|vou encaminhar|encaminhar sua duvida|encaminhar sua duvida para|encaminhar para (um )?atendente|encaminhar para (a )?equipe|atendente confirmar|equipe confirmar|continuar seu atendimento|atendimento humano)\b/i;
const GREETING_ONLY_REGEX =
  /^(oi+|ola+|olaa+|opa+|opaa+|e ai+|eae+|iae+|fala+|salve+|bom dia|boa tarde|boa noite|hey+|hello+)[!.?, ]*$/i;

const hasExplicitHumanHandoffRequest = (text: string): boolean =>
  HUMAN_HANDOFF_REGEX.test(text);

const normalizeIntentText = (text: string): string =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const isHandoffConfirmationReply = (text: string): boolean =>
  HANDOFF_CONFIRMATION_REPLY_REGEX.test(normalizeIntentText(text));

const didMessageOfferHumanHandoff = (text: string): boolean =>
  HANDOFF_OFFER_MESSAGE_REGEX.test(normalizeIntentText(text));

const isGreetingOnlyMessage = (text: string): boolean => {
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  return GREETING_ONLY_REGEX.test(normalized);
};

const buildGreetingReply = (contactName?: string | null): string =>
  contactName?.trim()
    ? "Opa! Como posso ajudar?"
    : "Opa! Como posso te chamar?";

const shouldTriggerHumanHandoff = (
  userText: string,
  extraction?: { wantsHuman?: boolean },
): boolean => {
  const explicitRequest = hasExplicitHumanHandoffRequest(userText);
  if (explicitRequest) return true;
  return extraction?.wantsHuman === true;
};

const didUserConfirmRecentHandoffOffer = async (
  prisma: PrismaClient,
  contactId: number,
  userText: string,
): Promise<boolean> => {
  if (!isHandoffConfirmationReply(userText)) return false;

  const latestOutbound = await prisma.message.findFirst({
    where: {
      contactId,
      direction: "out",
      source: { in: ["AI", "SYSTEM"] },
    },
    orderBy: { createdAt: "desc" },
    select: {
      body: true,
      createdAt: true,
    },
  });

  if (!latestOutbound) return false;
  if (Date.now() - latestOutbound.createdAt.getTime() > 15 * 60_000) return false;

  return didMessageOfferHumanHandoff(latestOutbound.body);
};

const resolveHumanHandoffIntent = async (
  prisma: PrismaClient,
  contactId: number,
  userText: string,
  extraction?: { wantsHuman?: boolean },
): Promise<boolean> => {
  if (shouldTriggerHumanHandoff(userText, extraction)) return true;
  return didUserConfirmRecentHandoffOffer(prisma, contactId, userText);
};

type ContactTriageSnapshot = {
  name?: string | null;
  email?: string | null;
  tournament?: string | null;
  eventDate?: string | null;
  category?: string | null;
  city?: string | null;
  teamName?: string | null;
  playersCount?: number | null;
};

type OperationalAlertsSummary = {
  overdueTasks: number;
  pendingHandoffs: number;
  criticalHandoffs: number;
  updatedAt: string;
};

type HandoffStatusValue =
  | "NONE"
  | "QUEUED"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "RESOLVED";

type MessageSourceValue = "USER" | "AI" | "AGENT" | "SYSTEM";
type ContactChannelValue = ContactChannel;
type MetaOauthStatePayload = {
  type: "instagram_oauth";
};
type InstagramOauthCallbackBody = {
  accessToken?: unknown;
  state?: unknown;
  grantedScopes?: unknown;
};
type InstagramManualConnectionBody = {
  accessToken?: unknown;
};

type MessageDeliveryTarget = {
  waId: string;
  channel?: ContactChannelValue | null;
  externalId?: string | null;
  instagramConnection?: {
    pageId: string;
    pageAccessToken: string;
    instagramAccountId?: string | null;
  } | null;
};

type PipelineStatusFilterValue = "all" | "open" | "won" | "lost";
type PipelineHandoffFilterValue = "all" | "yes" | "no";
type PipelineBotFilterValue = "all" | "on" | "off";
type PipelineTriageFilterValue = "all" | "done" | "pending";

type PipelineQueryFilters = {
  searchTerm: string;
  statusFilter: PipelineStatusFilterValue;
  handoffFilter: PipelineHandoffFilterValue;
  botFilter: PipelineBotFilterValue;
  triageFilter: PipelineTriageFilterValue;
};

type HandoffStateSnapshot = {
  handoffRequested?: boolean | null;
  handoffStatus?: string | null;
  handoffAssignedToUserId?: string | null;
  handoffAssignedAt?: Date | null;
  handoffFirstHumanReplyAt?: Date | null;
};

type ResumePendingMessage = {
  body: string;
  waMessageId: string | null;
  createdAt: Date;
};

const ACTIVE_HANDOFF_STATUSES: HandoffStatusValue[] = [
  "QUEUED",
  "ASSIGNED",
  "IN_PROGRESS",
];

const META_OAUTH_STATE_TTL_SECONDS = 10 * 60;
const INSTAGRAM_CONTACT_PREFIX = "ig:";
const INSTAGRAM_DASHBOARD_PATH = "/dashboard/instagram";

const oauthStateSecretKey = new TextEncoder().encode(config.jwtSecret);

const inferContactChannel = (
  channel: ContactChannelValue | null | undefined,
  waId: string,
): ContactChannelValue =>
  channel ?? (waId.startsWith(INSTAGRAM_CONTACT_PREFIX) ? "INSTAGRAM" : "WHATSAPP");

const buildContactKey = (
  channel: ContactChannelValue,
  externalId: string,
): string => {
  const normalizedExternalId = externalId.trim();
  return channel === "INSTAGRAM"
    ? `${INSTAGRAM_CONTACT_PREFIX}${normalizedExternalId}`
    : normalizedExternalId;
};

const resolveContactExternalId = (
  waId: string,
  channel?: ContactChannelValue | null,
  externalId?: string | null,
): string => {
  const normalizedExternalId = externalId?.trim();
  if (normalizedExternalId) return normalizedExternalId;
  const resolvedChannel = inferContactChannel(channel, waId);
  return resolvedChannel === "INSTAGRAM"
    ? waId.replace(new RegExp(`^${INSTAGRAM_CONTACT_PREFIX}`), "")
    : waId;
};

const isInstagramWebhookPayload = (
  payload: unknown,
): payload is InstagramWebhookPayload =>
  typeof payload === "object" &&
  payload !== null &&
  ["page", "instagram"].includes(
    String((payload as { object?: unknown }).object ?? ""),
  );

const isWhatsAppWebhookPayload = (
  payload: unknown,
): payload is WhatsAppWebhookPayload =>
  typeof payload === "object" &&
  payload !== null &&
  (payload as { object?: unknown }).object === "whatsapp_business_account";

type WebhookChannel = "whatsapp" | "instagram";
type WebhookRouteChannel = WebhookChannel | "generic";

const resolveWebhookRouteChannel = (pathname: string): WebhookRouteChannel | null => {
  if (whatsappWebhookPaths.has(pathname)) return "whatsapp";
  if (instagramWebhookPaths.has(pathname)) return "instagram";
  if (legacyWebhookPaths.has(pathname)) return "generic";
  return null;
};

const resolveWebhookPayloadChannel = (payload: unknown): WebhookChannel | null => {
  if (isWhatsAppWebhookPayload(payload)) return "whatsapp";
  if (isInstagramWebhookPayload(payload)) return "instagram";
  return null;
};

const resolveWebhookAppSecret = (channel: WebhookChannel): string | undefined =>
  channel === "whatsapp" ? config.whatsappAppSecret : config.instagramAppSecret;

const resolveWebhookVerifyTokens = (channel: WebhookRouteChannel): string[] => {
  const tokens =
    channel === "whatsapp"
      ? [config.whatsappWebhookVerifyToken]
      : channel === "instagram"
        ? [config.instagramWebhookVerifyToken]
        : [
            config.whatsappWebhookVerifyToken,
            config.instagramWebhookVerifyToken,
            config.metaWebhookVerifyToken,
            config.webhookVerifyToken,
          ];

  return tokens.filter((token): token is string => Boolean(token?.trim()));
};

const resolveAppOrigin = (req?: Request): string => {
  const configuredOrigin = config.allowedOrigins.find(
    (origin) => origin !== "*" && /^https?:\/\//i.test(origin),
  );
  if (configuredOrigin) return configuredOrigin;

  if (req) {
    try {
      return new URL(req.url).origin;
    } catch {
      // Ignore invalid request urls.
    }
  }

  return "http://localhost:5173";
};

const buildAppRedirectUrl = (
  req: Request,
  path: string,
  params?: Record<string, string | null | undefined>,
): string => {
  const url = new URL(path, resolveAppOrigin(req));
  for (const [key, value] of Object.entries(params ?? {})) {
    if (!value) continue;
    url.searchParams.set(key, value);
  }
  return url.toString();
};

const signInstagramOauthState = async (userId: string): Promise<string> =>
  new SignJWT({ type: "instagram_oauth" as MetaOauthStatePayload["type"] })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setJti(crypto.randomUUID())
    .setExpirationTime(Math.floor(Date.now() / 1000) + META_OAUTH_STATE_TTL_SECONDS)
    .sign(oauthStateSecretKey);

const verifyInstagramOauthState = async (
  state: string,
): Promise<{ userId: string }> => {
  const { payload } = await jwtVerify(state, oauthStateSecretKey, {
    algorithms: ["HS256"],
  });
  if (payload.type !== "instagram_oauth" || !payload.sub) {
    throw new Error("Estado OAuth invalido");
  }
  return { userId: payload.sub };
};

const normalizeInstagramGrantedScopes = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
};

const normalizeMetaAccessToken = (value: unknown): string => {
  if (typeof value !== "string") return "";

  return value
    .trim()
    .replace(/^Bearer\s+/i, "")
    .replace(/^['"]+|['"]+$/g, "")
    .replace(/\s+/g, "");
};

const buildInstagramDashboardRedirect = (
  req: Request,
  status: "connected" | "error",
  message: string,
): string =>
  buildAppRedirectUrl(req, INSTAGRAM_DASHBOARD_PATH, {
    status,
    message,
  });

const renderInstagramOauthCallbackBridge = (req: Request): Response => {
  const callbackUrl = new URL(req.url);
  const callbackPath = callbackUrl.pathname;
  const fallbackRedirect = buildAppRedirectUrl(req, INSTAGRAM_DASHBOARD_PATH);
  const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Conectando Instagram</title>
    <style>
      body {
        margin: 0;
        font-family: Arial, sans-serif;
        background: #0f172a;
        color: #e2e8f0;
        min-height: 100vh;
        display: grid;
        place-items: center;
      }
      main {
        width: min(460px, calc(100vw - 32px));
        border: 1px solid rgba(148, 163, 184, 0.24);
        border-radius: 20px;
        padding: 24px;
        background: rgba(15, 23, 42, 0.92);
        box-shadow: 0 20px 50px rgba(15, 23, 42, 0.45);
      }
      h1 {
        margin: 0 0 10px;
        font-size: 22px;
      }
      p {
        margin: 0;
        line-height: 1.5;
        color: #cbd5e1;
      }
      .hint {
        margin-top: 14px;
        font-size: 14px;
        color: #94a3b8;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Finalizando conexao</h1>
      <p>Estamos validando o retorno da Meta e vinculando a conta ao painel.</p>
      <p class="hint">Se nada acontecer em alguns segundos, feche esta janela e tente novamente.</p>
    </main>
    <script>
      const redirectBase = ${JSON.stringify(fallbackRedirect)};
      const callbackPath = ${JSON.stringify(callbackPath)};

      const redirectToApp = (status, message) => {
        const target = new URL(redirectBase);
        if (status) target.searchParams.set("status", status);
        if (message) target.searchParams.set("message", message);
        window.location.replace(target.toString());
      };

      const finalize = async () => {
        const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const query = new URLSearchParams(window.location.search);
        const accessToken = fragment.get("access_token") || query.get("access_token");
        const state = fragment.get("state") || query.get("state");
        const errorReason = fragment.get("error_reason") || query.get("error_reason");
        const errorDescription =
          fragment.get("error_description") || query.get("error_description");
        const grantedScopesRaw =
          fragment.get("granted_scopes") || query.get("granted_scopes");

        if (errorReason || errorDescription) {
          redirectToApp("error", errorDescription || errorReason || "Conexao cancelada.");
          return;
        }

        if (!accessToken || !state) {
          redirectToApp("error", "Callback da Meta incompleto.");
          return;
        }

        const grantedScopes = grantedScopesRaw
          ? grantedScopesRaw.split(",").map((item) => item.trim()).filter(Boolean)
          : [];

        try {
          const response = await fetch(callbackPath, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              accessToken,
              state,
              grantedScopes,
            }),
          });

          const payload = await response.json().catch(() => null);
          if (payload && typeof payload.redirectUrl === "string") {
            window.location.replace(payload.redirectUrl);
            return;
          }

          redirectToApp(
            "error",
            payload && typeof payload.error === "string"
              ? payload.error
              : "Nao foi possivel concluir a conexao.",
          );
        } catch {
          redirectToApp("error", "Falha de rede ao concluir a conexao.");
        }
      };

      void finalize();
    </script>
  </body>
</html>`;

  return textResponse(html, 200, req, "text/html; charset=utf-8");
};

const verifyMetaWebhookSignature = async (
  signatureHeader: string | null | undefined,
  rawBody: string,
  appSecret?: string,
): Promise<boolean> => {
  const normalizedAppSecret = appSecret?.trim();
  const normalizedSignature = signatureHeader?.trim();

  if (!normalizedAppSecret || !normalizedSignature) {
    return true;
  }

  if (!normalizedSignature.startsWith("sha256=")) {
    return false;
  }

  const expected = normalizedSignature.slice("sha256=".length);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(normalizedAppSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody),
  );
  const actual = Array.from(new Uint8Array(signatureBuffer))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");

  if (actual.length !== expected.length) return false;

  let mismatch = 0;
  for (let index = 0; index < actual.length; index += 1) {
    mismatch |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return mismatch === 0;
};

const resumedReplyContactSelect = {
  id: true,
  waId: true,
  channel: true,
  externalId: true,
  name: true,
  email: true,
  tournament: true,
  eventDate: true,
  category: true,
  city: true,
  teamName: true,
  playersCount: true,
  age: true,
  level: true,
  stageId: true,
  triageCompleted: true,
  botEnabled: true,
  handoffRequested: true,
  instagramConnection: {
    select: {
      pageId: true,
      pageAccessToken: true,
      instagramAccountId: true,
    },
  },
} satisfies Prisma.ContactSelect;

const sendTextToTarget = async (
  target: MessageDeliveryTarget,
  body: string,
  options?: {
    allowHumanAgentTag?: boolean;
  },
): Promise<void> => {
  const channel = inferContactChannel(target.channel, target.waId);
  const externalId = resolveContactExternalId(
    target.waId,
    channel,
    target.externalId,
  );

  if (channel === "INSTAGRAM") {
    if (!target.instagramConnection?.pageId || !target.instagramConnection?.pageAccessToken) {
      throw new Error(
        `Instagram contact ${target.waId} is missing an active connection.`,
      );
    }
    const taggedMessageOptions = options?.allowHumanAgentTag
      ? {
          messagingType: "MESSAGE_TAG" as const,
          tag: "HUMAN_AGENT" as const,
        }
      : undefined;

    try {
      await instagram.sendTextMessage(
        target.instagramConnection.pageId,
        target.instagramConnection.pageAccessToken,
        externalId,
        body,
        target.instagramConnection.instagramAccountId,
        taggedMessageOptions,
      );
    } catch (error) {
      const canRetryWithoutTag =
        options?.allowHumanAgentTag &&
        error instanceof InstagramApiError &&
        (error.status === 400 || error.status === 403);

      if (!canRetryWithoutTag) {
        throw error;
      }

      console.warn(
        `[instagram-send] HUMAN_AGENT tag rejected for ${target.waId}; retrying as RESPONSE`,
      );

      await instagram.sendTextMessage(
        target.instagramConnection.pageId,
        target.instagramConnection.pageAccessToken,
        externalId,
        body,
        target.instagramConnection.instagramAccountId,
      );
    }
    return;
  }

  await whatsapp.sendTextMessage(externalId, body);
};

const sendTypingIndicatorToTarget = async (
  target: MessageDeliveryTarget,
  messageId: string | null | undefined,
  type: "text" | "audio" = "text",
): Promise<void> => {
  const channel = inferContactChannel(target.channel, target.waId);
  if (channel !== "WHATSAPP" || !messageId) return;
  await whatsapp.sendTypingIndicator(messageId, type);
};

const PIPELINE_PAGE_SIZE_DEFAULT = 20;
const PIPELINE_PAGE_SIZE_MIN = 5;
const PIPELINE_PAGE_SIZE_MAX = 100;
const VALID_PIPELINE_STATUS_FILTERS = new Set<PipelineStatusFilterValue>([
  "all",
  "open",
  "won",
  "lost",
]);
const VALID_PIPELINE_HANDOFF_FILTERS = new Set<PipelineHandoffFilterValue>([
  "all",
  "yes",
  "no",
]);
const VALID_PIPELINE_BOT_FILTERS = new Set<PipelineBotFilterValue>([
  "all",
  "on",
  "off",
]);
const VALID_PIPELINE_TRIAGE_FILTERS = new Set<PipelineTriageFilterValue>([
  "all",
  "done",
  "pending",
]);

const PIPELINE_CONTACT_INCLUDE = {
  tags: { include: { tag: true } },
  messages: {
    orderBy: { createdAt: "desc" },
    take: 1,
    select: { body: true, createdAt: true },
  },
} satisfies Prisma.ContactInclude;

const activeHandoffWhere = (): Prisma.ContactWhereInput => ({
  OR: [
    { handoffRequested: true },
    { handoffStatus: { in: ACTIVE_HANDOFF_STATUSES } },
  ],
});

const parseBoundedInteger = (
  raw: string | null,
  defaultValue: number,
  min: number,
  max: number,
): number => {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) return defaultValue;
  return Math.min(max, Math.max(min, parsed));
};

const parsePipelineStageId = (raw: string | null): number | null | "invalid" => {
  if (raw === null || raw === "" || raw === "null" || raw === "unassigned") {
    return null;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) return "invalid";
  return parsed;
};

const parsePipelineFilters = (url: URL): PipelineQueryFilters => {
  const statusRaw = url.searchParams.get("statusFilter")?.trim().toLowerCase() ?? "all";
  const handoffRaw = url.searchParams.get("handoffFilter")?.trim().toLowerCase() ?? "all";
  const botRaw = url.searchParams.get("botFilter")?.trim().toLowerCase() ?? "all";
  const triageRaw = url.searchParams.get("triageFilter")?.trim().toLowerCase() ?? "all";

  return {
    searchTerm: url.searchParams.get("searchTerm")?.trim() ?? "",
    statusFilter: VALID_PIPELINE_STATUS_FILTERS.has(statusRaw as PipelineStatusFilterValue)
      ? (statusRaw as PipelineStatusFilterValue)
      : "all",
    handoffFilter: VALID_PIPELINE_HANDOFF_FILTERS.has(handoffRaw as PipelineHandoffFilterValue)
      ? (handoffRaw as PipelineHandoffFilterValue)
      : "all",
    botFilter: VALID_PIPELINE_BOT_FILTERS.has(botRaw as PipelineBotFilterValue)
      ? (botRaw as PipelineBotFilterValue)
      : "all",
    triageFilter: VALID_PIPELINE_TRIAGE_FILTERS.has(triageRaw as PipelineTriageFilterValue)
      ? (triageRaw as PipelineTriageFilterValue)
      : "all",
  };
};

const buildPipelineContactsWhere = (
  stageId: number | null,
  filters: PipelineQueryFilters,
): Prisma.ContactWhereInput => {
  const where: Prisma.ContactWhereInput = { stageId };

  if (filters.statusFilter !== "all") {
    where.leadStatus = filters.statusFilter;
  }

  if (filters.handoffFilter === "yes") {
    where.handoffRequested = true;
  } else if (filters.handoffFilter === "no") {
    where.handoffRequested = false;
  }

  if (filters.botFilter === "on") {
    where.botEnabled = true;
  } else if (filters.botFilter === "off") {
    where.botEnabled = false;
  }

  if (filters.triageFilter === "done") {
    where.triageCompleted = true;
  } else if (filters.triageFilter === "pending") {
    where.triageCompleted = false;
  }

  if (filters.searchTerm) {
    const contains = { contains: filters.searchTerm, mode: "insensitive" as const };
    where.OR = [
      { name: contains },
      { waId: contains },
      { email: contains },
      { tournament: contains },
      { city: contains },
      { category: contains },
      { teamName: contains },
      { messages: { some: { body: contains } } },
    ];
  }

  return where;
};

const buildPipelineCacheKey = (scope: string, url: URL): string => {
  const sortedParams = new URLSearchParams(
    [...url.searchParams.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
  const suffix = sortedParams.toString() || "default";
  return `${DASHBOARD_CACHE_PREFIX}pipeline:${scope}:${suffix}`;
};

const loadPipelineColumnPage = async (
  prisma: PrismaClient,
  stageId: number | null,
  filters: PipelineQueryFilters,
  limit: number,
  requestedOffset: number,
) => {
  const where = buildPipelineContactsWhere(stageId, filters);
  const total = await prisma.contact.count({ where });
  const maxOffset = total > 0 ? Math.floor((total - 1) / limit) * limit : 0;
  const offset = Math.min(Math.max(0, requestedOffset), maxOffset);
  const items = await prisma.contact.findMany({
    where,
    include: PIPELINE_CONTACT_INCLUDE,
    orderBy: { lastInteractionAt: "desc" },
    skip: offset,
    take: limit,
  });

  return {
    items,
    total,
    limit,
    offset,
  };
};

const deriveHandoffStatus = (contact: HandoffStateSnapshot): HandoffStatusValue => {
  const currentStatus = contact.handoffStatus?.trim().toUpperCase() ?? "";
  if (
    currentStatus === "QUEUED" ||
    currentStatus === "ASSIGNED" ||
    currentStatus === "IN_PROGRESS" ||
    currentStatus === "RESOLVED"
  ) {
    return currentStatus;
  }

  if (contact.handoffRequested) {
    if (contact.handoffFirstHumanReplyAt) return "IN_PROGRESS";
    if (contact.handoffAssignedToUserId) return "ASSIGNED";
    return "QUEUED";
  }

  return "NONE";
};

const buildQueuedHandoffState = (
  reason: string,
  handoffAt: Date = new Date(),
): Prisma.ContactUncheckedUpdateInput => ({
  botEnabled: false,
  handoffRequested: true,
  handoffStatus: "QUEUED",
  handoffReason: reason,
  handoffAt,
  handoffAssignedAt: null,
  handoffAssignedToUserId: null,
  handoffFirstHumanReplyAt: null,
  handoffResolvedAt: null,
  handoffResolvedByUserId: null,
});

const buildAssignedHandoffState = (
  contact: HandoffStateSnapshot,
  userId: string,
  assignedAt: Date = new Date(),
): Prisma.ContactUncheckedUpdateInput => ({
  botEnabled: false,
  handoffRequested: true,
  handoffStatus: contact.handoffFirstHumanReplyAt ? "IN_PROGRESS" : "ASSIGNED",
  handoffAssignedToUserId: userId,
  handoffAssignedAt: contact.handoffAssignedAt ?? assignedAt,
  handoffResolvedAt: null,
  handoffResolvedByUserId: null,
});

const buildReleasedHandoffState = (): Prisma.ContactUncheckedUpdateInput => ({
  botEnabled: false,
  handoffRequested: true,
  handoffStatus: "QUEUED",
  handoffAssignedToUserId: null,
  handoffAssignedAt: null,
  handoffFirstHumanReplyAt: null,
  handoffResolvedAt: null,
  handoffResolvedByUserId: null,
});

const buildInProgressHandoffState = (
  contact: HandoffStateSnapshot,
  userId: string,
  respondedAt: Date = new Date(),
): Prisma.ContactUncheckedUpdateInput => ({
  botEnabled: false,
  handoffRequested: true,
  handoffStatus: "IN_PROGRESS",
  handoffAssignedToUserId: contact.handoffAssignedToUserId ?? userId,
  handoffAssignedAt: contact.handoffAssignedAt ?? respondedAt,
  handoffFirstHumanReplyAt: contact.handoffFirstHumanReplyAt ?? respondedAt,
  handoffResolvedAt: null,
  handoffResolvedByUserId: null,
});

const buildResolvedHandoffState = (
  userId: string,
  resolvedAt: Date = new Date(),
): Prisma.ContactUncheckedUpdateInput => ({
  botEnabled: true,
  handoffRequested: false,
  handoffStatus: "RESOLVED",
  handoffReason: null,
  handoffAt: null,
  handoffAssignedAt: null,
  handoffAssignedToUserId: null,
  handoffFirstHumanReplyAt: null,
  handoffResolvedAt: resolvedAt,
  handoffResolvedByUserId: userId,
});

const buildNoHandoffState = (): Partial<Prisma.ContactUncheckedCreateInput> => ({
  handoffRequested: false,
  handoffStatus: "NONE",
  handoffReason: null,
  handoffAt: null,
  handoffAssignedAt: null,
  handoffAssignedToUserId: null,
  handoffFirstHumanReplyAt: null,
  handoffResolvedAt: null,
  handoffResolvedByUserId: null,
  botEnabled: true,
});

const buildHandoffAcknowledgement = (): string =>
  "Perfeito. Um atendente do nosso time vai verificar essa informação e continuar seu atendimento em instantes.";

const computeMissingLeadFields = (contact: ContactTriageSnapshot): string[] => {
  const missing: string[] = [];

  if (!contact.name?.trim()) missing.push("nome");
  if (!contact.tournament?.trim()) missing.push("campeonato");
  if (!contact.eventDate?.trim()) missing.push("data do campeonato");
  if (!contact.category?.trim()) missing.push("categoria");
  if (!contact.city?.trim()) missing.push("cidade");

  const hasTeamOrPlayers =
    Boolean(contact.teamName?.trim()) ||
    (typeof contact.playersCount === "number" && contact.playersCount > 0);
  if (!hasTeamOrPlayers) {
    missing.push("time ou quantidade de jogadores");
  }

  return missing;
};

/** Auto-move contact to next pipeline stage when triage is complete and stageId is null */
const tryAutoQualify = async (
  prisma: PrismaClient,
  contactId: number,
  triageCompleted: boolean,
  currentStageId: number | null,
): Promise<void> => {
  try {
    // Only auto-qualify if triage is complete and contact has no stage yet
    if (!triageCompleted || currentStageId !== null) return;

    // Get the first (earliest) pipeline stage
    const firstStage = await prisma.pipelineStage.findFirst({
      where: { isActive: true },
      orderBy: { position: "asc" },
      select: { id: true, name: true },
    });

    if (!firstStage) return;

    // Move contact to first stage
    const updated = await prisma.contact.update({
      where: { id: contactId },
      data: { stageId: firstStage.id },
    });

    console.log(
      `[auto-qualify] moved contact ${contactId} to stage "${firstStage.name}"`,
    );

    broadcast("contact:qualified", {
      contactId,
      stagedId: firstStage.id,
      stageName: firstStage.name,
    });

    void invalidateDashboardCaches();
  } catch (error) {
    console.error("[auto-qualify] failed for contact", contactId, error);
  }
};

// ── Auto-tags: apply tags based on extracted lead data ────────────────────────
const AUTO_TAG_RULES: Array<{
  name: string;
  color: string;
  match: (c: ContactTriageSnapshot & { age?: string | null; level?: string | null }) => boolean;
}> = [
  {
    name: "Urgente",
    color: "#ef4444",
    match: (c) => {
      if (!c.eventDate) return false;
      const eventDate = new Date(c.eventDate);
      if (Number.isNaN(eventDate.getTime())) return false;
      const daysUntil = (eventDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      return daysUntil >= 0 && daysUntil <= 7;
    },
  },
  {
    name: "Time Pequeno",
    color: "#f59e0b",
    match: (c) =>
      typeof c.playersCount === "number" && c.playersCount > 0 && c.playersCount < 5,
  },
  {
    name: "Time Grande",
    color: "#10b981",
    match: (c) => typeof c.playersCount === "number" && c.playersCount >= 10,
  },
  {
    name: "Iniciante",
    color: "#8b5cf6",
    match: (c) => {
      const lvl = c.level?.toLowerCase().trim() ?? "";
      return /^(iniciante|beginner|noob|novato|comecando)$/.test(lvl);
    },
  },
];

const tryAutoTag = async (
  prisma: PrismaClient,
  contactId: number,
  snapshot: ContactTriageSnapshot & { age?: string | null; level?: string | null },
): Promise<void> => {
  try {
    const matchedRules = AUTO_TAG_RULES.filter((rule) => rule.match(snapshot));
    if (matchedRules.length === 0) return;

    for (const rule of matchedRules) {
      // Upsert tag
      const tag = await prisma.tag.upsert({
        where: { name: rule.name },
        update: {},
        create: { name: rule.name, color: rule.color },
      });

      // Link to contact if not already linked
      const existing = await prisma.contactTag.findUnique({
        where: { contactId_tagId: { contactId, tagId: tag.id } },
        select: { id: true },
      });

      if (!existing) {
        await prisma.contactTag.create({
          data: { contactId, tagId: tag.id },
        });
        console.log(`[auto-tag] added "${rule.name}" to contact ${contactId}`);
        broadcast("contact:tagged", { contactId, tagName: rule.name, tagId: tag.id });
      }
    }
  } catch (error) {
    console.error("[auto-tag] failed for contact", contactId, error);
  }
};

// ── FAQ Feedback Loop: cache recent Q&A and serve cached answer for repeated questions ──
const FAQ_FEEDBACK_CACHE_PREFIX = "esports:faq-feedback:";
const FAQ_FEEDBACK_TTL_SECONDS = 24 * 60 * 60; // 24h
const FACTUAL_FAQ_CACHE_BYPASS_REGEX =
  /\b(valor|preco|custa|custo|ticket|ingresso|inscricao|horario|hora|horas|data|dia|quando|onde|local|endereco|edicao|temporada|regra|regras|formato|como funciona)\b/i;
const NON_CACHEABLE_REPLY_REGEX =
  /\b(nao sei|não sei|nao informa|não informa|nao encontrei|não encontrei|confirmar o preco|confirmar o preço|encaminh|equipe confirmar|quer que eu encaminhe)\b/i;

const normalizeFaqKey = (text: string): string =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !AUTO_FAQ_STOP_WORDS.has(w))
    .sort()
    .join("_");

const shouldBypassReplyCache = (text: string): boolean =>
  FACTUAL_FAQ_CACHE_BYPASS_REGEX.test(
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, ""),
  );

const shouldCacheBotReply = (reply: string): boolean => {
  const normalized = reply
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return !NON_CACHEABLE_REPLY_REGEX.test(normalized);
};

const tryFaqFeedbackCache = async (
  userMessage: string,
): Promise<string | null> => {
  if (shouldBypassReplyCache(userMessage)) return null;
  const key = normalizeFaqKey(userMessage);
  if (!key) return null;
  return cacheGetJson<string>(`${FAQ_FEEDBACK_CACHE_PREFIX}${key}`);
};

const saveFaqFeedbackCache = async (
  userMessage: string,
  aiReply: string,
): Promise<void> => {
  if (shouldBypassReplyCache(userMessage) || !shouldCacheBotReply(aiReply)) return;
  const key = normalizeFaqKey(userMessage);
  if (!key) return;
  await cacheSetJson(`${FAQ_FEEDBACK_CACHE_PREFIX}${key}`, aiReply, FAQ_FEEDBACK_TTL_SECONDS);
};

const invalidateReplyCaches = async (): Promise<void> => {
  await Promise.all([
    cacheDeleteByPrefix(FAQ_FEEDBACK_CACHE_PREFIX),
    cacheDeleteByPrefix(SEMANTIC_REPLY_CACHE_PREFIX),
  ]);
};

// ── Auto Tasks: detect task/reminder intent in user messages ──
const tryAutoTask = async (
  prisma: PrismaClient,
  contactId: number,
  userMessage: string,
): Promise<void> => {
  try {
    const taskIntent = await openAI.detectTaskIntent(userMessage, prisma);
    if (!taskIntent) return;

    await prisma.task.create({
      data: {
        contactId,
        title: taskIntent.title,
        dueAt: new Date(taskIntent.dueAt),
        status: "open",
        priority: "medium",
      },
    });

    console.log(`[auto-task] created "${taskIntent.title}" for contact ${contactId}`);
    broadcast("task:created", {
      contactId,
      title: taskIntent.title,
      dueAt: taskIntent.dueAt,
      source: "auto",
    });
    void invalidateDashboardCaches();
  } catch (error) {
    console.error("[auto-task] failed for contact", contactId, error);
  }
};

// ── Auto-summary on stage change ──
const tryAutoSummaryOnStageChange = async (
  prisma: PrismaClient,
  contactId: number,
  phone: string,
  previousStageId: number | null,
  newStageId: number | null,
): Promise<void> => {
  if (previousStageId === newStageId) return;
  if (newStageId === null) return;

  try {
    const aiSettings = await openAI.getRuntimeSettings(prisma);
    const stage = await prisma.pipelineStage.findUnique({
      where: { id: newStageId },
      select: { name: true },
    });

    const messages = await prisma.message.findMany({
      where: { contactId },
      orderBy: { createdAt: "asc" },
      take: 60,
      select: { direction: true, body: true },
    });

    const transcript = messages
      .map(
        (m) =>
          `${m.direction === "in" ? "Usuario" : "Assistente"}: ${sanitizeMessageBodyForAi(m.body)}`,
      )
      .join("\n");

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: aiSettings.model,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: `O contato acabou de ser movido para o estagio "${stage?.name ?? "desconhecido"}" no pipeline. Resuma a conversa em no maximo 150 palavras, focando nos pontos relevantes para este novo estagio. Responda apenas com o resumo.`,
              },
            ],
          },
          {
            role: "user",
            content: [{ type: "input_text", text: transcript }],
          },
        ],
        max_output_tokens: 250,
      }),
    });

    if (!response.ok) return;

    const payload = (await response.json()) as { output_text?: string };
    const summary = payload.output_text?.trim();
    if (!summary) return;

    await prisma.contact.update({
      where: { id: contactId },
      data: { aiSummary: summary },
    });

    console.log(`[auto-summary-stage] updated for contact ${phone} -> ${stage?.name}`);
  } catch (error) {
    console.error(`[auto-summary-stage] failed for contact ${phone}`, error);
  }
};

// ── Semantic reply cache: reuse similar answers ──
const SEMANTIC_REPLY_CACHE_PREFIX = "esports:semantic-reply:";
const SEMANTIC_REPLY_TTL_SECONDS = 12 * 60 * 60; // 12h

const buildSemanticKey = (text: string): string => {
  const words = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !AUTO_FAQ_STOP_WORDS.has(w))
    .sort();
  return words.slice(0, 5).join("_");
};

const trySemanticReplyCache = async (
  userMessage: string,
): Promise<string | null> => {
  if (shouldBypassReplyCache(userMessage)) return null;
  const key = buildSemanticKey(userMessage);
  if (!key) return null;
  return cacheGetJson<string>(`${SEMANTIC_REPLY_CACHE_PREFIX}${key}`);
};

const saveSemanticReplyCache = async (
  userMessage: string,
  aiReply: string,
): Promise<void> => {
  if (shouldBypassReplyCache(userMessage) || !shouldCacheBotReply(aiReply)) return;
  const key = buildSemanticKey(userMessage);
  if (!key) return;
  await cacheSetJson(`${SEMANTIC_REPLY_CACHE_PREFIX}${key}`, aiReply, SEMANTIC_REPLY_TTL_SECONDS);
};

// ── Handoff Escalation: auto-check stale handoffs and send WhatsApp follow-up ──
const HANDOFF_ESCALATION_INTERVAL_MS = 60_000; // check every 60s
const HANDOFF_ESCALATION_WARN_MINUTES = 15;
let handoffEscalationInterval: ReturnType<typeof setInterval> | null = null;
const PENDING_AUTO_REPLY_RECOVERY_INTERVAL_MS = 60_000;
const PENDING_AUTO_REPLY_RECOVERY_LOOKBACK_MS = 23 * 60 * 60 * 1000;
const PENDING_AUTO_REPLY_RECOVERY_BATCH_SIZE = 80;
let pendingAutoReplyRecoveryInterval: ReturnType<typeof setInterval> | null = null;

const runHandoffEscalation = async (): Promise<void> => {
  const prisma = await getPrismaClient();
  if (!prisma) return;

  try {
    const warnThreshold = new Date(
      Date.now() - HANDOFF_ESCALATION_WARN_MINUTES * 60_000,
    );

    // Find contacts waiting for handoff > 15 min that still have no human response
    const staleHandoffs = await prisma.contact.findMany({
      where: {
        AND: [
          activeHandoffWhere(),
        ],
        botEnabled: false,
        handoffAt: {
          not: null,
          lte: warnThreshold,
        },
      },
      select: {
        id: true,
        waId: true,
        channel: true,
        externalId: true,
        name: true,
        handoffAt: true,
        instagramConnection: {
          select: {
            pageId: true,
            pageAccessToken: true,
            instagramAccountId: true,
          },
        },
        messages: {
          where: { direction: "out", source: "SYSTEM" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true, body: true },
        },
      },
    });

    const agentReplies = await prisma.message.findMany({
      where: {
        contactId: { in: staleHandoffs.map((contact) => contact.id) },
        direction: "out",
        source: "AGENT",
      },
      orderBy: { createdAt: "desc" },
      select: { contactId: true, createdAt: true },
    });

    const latestAgentReplyByContact = new Map<number, Date>();
    for (const message of agentReplies) {
      if (!latestAgentReplyByContact.has(message.contactId)) {
        latestAgentReplyByContact.set(message.contactId, message.createdAt);
      }
    }

    for (const contact of staleHandoffs) {
      const lastSystemOut = contact.messages[0];
      const latestAgentReply = latestAgentReplyByContact.get(contact.id);
      const handoffTime = contact.handoffAt?.getTime() ?? 0;

      // Skip if a human already replied after handoff.
      if ((latestAgentReply?.getTime() ?? 0) > handoffTime) continue;

      // Skip if we already sent an escalation follow-up (check body pattern)
      if (lastSystemOut?.body?.includes("nosso time segue analisando")) continue;

      const waitMin = Math.floor((Date.now() - handoffTime) / 60_000);
      const followUp = `Oi${contact.name ? ` ${contact.name}` : ""}, nosso time segue analisando sua solicitacao. Tempo de espera atual: ${waitMin} min. Obrigado pela paciencia!`;

      try {
        await sendTextToTarget(contact, followUp, { allowHumanAgentTag: true });
        await persistTurn(contact.waId, "assistant", followUp, {
          source: "SYSTEM",
          channel: inferContactChannel(contact.channel, contact.waId),
          externalId: contact.externalId,
        });
        broadcast("message:new", {
          phone: contact.waId,
          role: "assistant",
          source: "SYSTEM",
          content: followUp,
        });
        broadcast("handoff:escalation", {
          contactId: contact.id,
          waId: contact.waId,
          waitMinutes: waitMin,
        });
        console.log(
          `[handoff-escalation] sent follow-up to ${contact.waId} (${waitMin}min wait)`,
        );
      } catch (err) {
        console.error(
          `[handoff-escalation] failed to send to ${contact.waId}`,
          err,
        );
      }
    }
  } catch (error) {
    console.error("[handoff-escalation] check failed", error);
  }
};

const startHandoffEscalation = (): void => {
  if (handoffEscalationInterval) return;
  handoffEscalationInterval = setInterval(() => {
    void runHandoffEscalation();
  }, HANDOFF_ESCALATION_INTERVAL_MS);
};

const stopHandoffEscalation = (): void => {
  if (!handoffEscalationInterval) return;
  clearInterval(handoffEscalationInterval);
  handoffEscalationInterval = null;
};

const runPendingAutoReplyRecovery = async (): Promise<void> => {
  const prisma = await getPrismaClient();
  if (!prisma) return;

  try {
    const since = new Date(Date.now() - PENDING_AUTO_REPLY_RECOVERY_LOOKBACK_MS);
    const pendingInbound = await prisma.message.findMany({
      where: {
        direction: "in",
        createdAt: { gte: since },
        contact: {
          botEnabled: true,
          handoffRequested: false,
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: PENDING_AUTO_REPLY_RECOVERY_BATCH_SIZE,
      select: {
        contact: {
          select: {
            waId: true,
          },
        },
      },
    });

    const waIds = Array.from(
      new Set(
        pendingInbound
          .map((message) => message.contact.waId?.trim())
          .filter((waId): waId is string => Boolean(waId)),
      ),
    );

    if (waIds.length === 0) return;

    console.log(
      `[pending-auto-reply] scanning ${waIds.length} active contact(s) for unanswered backlog`,
    );

    for (const waId of waIds) {
      void replyPendingContactAfterBotResume(prisma, waId);
    }
  } catch (error) {
    console.error("[pending-auto-reply] recovery failed", error);
  }
};

const startPendingAutoReplyRecovery = (): void => {
  if (pendingAutoReplyRecoveryInterval) return;
  pendingAutoReplyRecoveryInterval = setInterval(() => {
    void runPendingAutoReplyRecovery();
  }, PENDING_AUTO_REPLY_RECOVERY_INTERVAL_MS);
  void runPendingAutoReplyRecovery();
};

const stopPendingAutoReplyRecovery = (): void => {
  if (!pendingAutoReplyRecoveryInterval) return;
  clearInterval(pendingAutoReplyRecoveryInterval);
  pendingAutoReplyRecoveryInterval = null;
};

const VALID_LEAD_STATUS = new Set(["open", "won", "lost"]);
const VALID_TASK_STATUS = new Set(["open", "in_progress", "done", "cancelled"]);
const VALID_TASK_PRIORITY = new Set(["low", "medium", "high", "urgent"]);
const ALERTS_BROADCAST_INTERVAL_MS = 20_000;
let lastBroadcastedAlertsSignature = "";
let alertsBroadcastInterval: ReturnType<typeof setInterval> | null = null;
const DASHBOARD_CACHE_PREFIX = "esports:dashboard:";
const DASHBOARD_CACHE_TTL_SECONDS = 20;
const PIPELINE_CACHE_TTL_SECONDS = 10;

const invalidateDashboardCaches = async (): Promise<void> => {
  await cacheDeleteByPrefix(DASHBOARD_CACHE_PREFIX);
};

const hasOwn = (obj: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(obj, key);

const normalizeNullableText = (value: unknown): string | null | undefined => {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || null;
};

const normalizePositiveInt = (value: unknown): number | null | undefined => {
  if (value === null) return null;
  const num =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;
  if (!Number.isFinite(num)) return undefined;
  if (num <= 0) return null;
  return Math.floor(num);
};

const parseDateInput = (value: unknown): Date | null | undefined => {
  if (value === null) return null;
  if (!(typeof value === "string" || value instanceof Date)) return undefined;

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed;
};

const toAlertSignature = (summary: OperationalAlertsSummary): string =>
  [
    summary.overdueTasks,
    summary.pendingHandoffs,
    summary.criticalHandoffs,
  ].join(":");

const getOperationalAlertsSummary = async (
  prisma: PrismaClient,
): Promise<OperationalAlertsSummary> => {
  const now = new Date();
  const criticalThreshold = new Date(
    now.getTime() - HANDOFF_CRITICAL_MINUTES * 60_000,
  );

  const [overdueTasks, pendingHandoffs, criticalHandoffs] = await Promise.all([
    prisma.task.count({
      where: {
        status: { notIn: ["done", "cancelled"] },
        dueAt: { lt: now },
      },
    }),
    prisma.contact.count({
      where: activeHandoffWhere(),
    }),
    prisma.contact.count({
      where: {
        AND: [
          activeHandoffWhere(),
        ],
        handoffAt: {
          not: null,
          lte: criticalThreshold,
        },
      },
    }),
  ]);

  return {
    overdueTasks,
    pendingHandoffs,
    criticalHandoffs,
    updatedAt: now.toISOString(),
  };
};

const emitAlertsSummary = async (prisma?: PrismaClient): Promise<void> => {
  const db = prisma ?? (await getPrismaClient());
  if (!db) return;

  try {
    const summary = await getOperationalAlertsSummary(db);
    const signature = toAlertSignature(summary);
    if (signature === lastBroadcastedAlertsSignature) {
      return;
    }
    lastBroadcastedAlertsSignature = signature;
    broadcast("alerts:summary", summary as unknown as Record<string, unknown>);
  } catch (error) {
    console.error("Failed to compute alerts summary", error);
  }
};

const startAlertsBroadcast = (): void => {
  if (alertsBroadcastInterval) return;
  alertsBroadcastInterval = setInterval(() => {
    void emitAlertsSummary();
  }, ALERTS_BROADCAST_INTERVAL_MS);
  void emitAlertsSummary();
};

const stopAlertsBroadcast = (): void => {
  if (!alertsBroadcastInterval) return;
  clearInterval(alertsBroadcastInterval);
  alertsBroadcastInterval = null;
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const computeReplyDelayMs = (text: string): number => {
  const proportionalDelay = Math.round(text.length * config.replyDelayPerCharMs);
  return Math.min(
    config.replyDelayMaxMs,
    Math.max(config.replyDelayMinMs, proportionalDelay),
  );
};

// ── Auto-FAQ: when 2+ contacts ask similar questions, suggest a FAQ entry ────
const AUTO_FAQ_STOP_WORDS = new Set([
  "para", "como", "qual", "quais", "que", "com", "por", "mas", "nao", "sim",
  "esse", "essa", "isso", "este", "esta", "voce", "minha", "meu", "sua", "seu",
  "uma", "uns", "das", "dos", "nas", "nos", "tem", "ter", "ser", "estar",
  "pelo", "pela", "mais", "menos", "sobre", "depois", "antes", "tambem",
]);

const tryAutoFaq = async (
  prisma: PrismaClient,
  phone: string,
  userMessage: string,
  aiReply: string,
): Promise<void> => {
  try {
    const words = userMessage
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !AUTO_FAQ_STOP_WORDS.has(w));

    if (words.length < 1) return;

    const currentContact = await prisma.contact.findUnique({
      where: { waId: phone },
      select: { id: true },
    });
    if (!currentContact) return;

    // Find similar messages from OTHER contacts (all top words must appear)
    const searchWords = words.slice(0, 2);
    const similarMessages = await prisma.message.findMany({
      where: {
        direction: "in",
        contactId: { not: currentContact.id },
        AND: searchWords.map((word) => ({
          body: { contains: word, mode: "insensitive" as const },
        })),
      },
      select: { contactId: true },
      take: 20,
    });

    const uniqueContacts = new Set(similarMessages.map((m) => m.contactId));
    if (uniqueContacts.size < 1) return;

    const suggestion = await openAI.suggestFaqEntry(userMessage, aiReply, prisma);
    if (!suggestion) return;

    // Check if a similar FAQ already exists before creating
    const faqSearchWords = suggestion.question
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !AUTO_FAQ_STOP_WORDS.has(w))
      .slice(0, 2);

    if (faqSearchWords.length > 0) {
      const existingFaq = await prisma.faq.findFirst({
        where: {
          AND: faqSearchWords.map((word) => ({
            question: { contains: word, mode: "insensitive" as const },
          })),
        },
        select: { id: true },
      });
      if (existingFaq) return;
    }

    try {
      await prisma.faq.create({
        data: {
          question: suggestion.question,
          answer: suggestion.answer,
          isActive: true,
        },
      });
      console.log(`[auto-faq] created: "${suggestion.question}"`);
      void invalidateDashboardCaches();
      broadcast("faq:created", { question: suggestion.question, answer: suggestion.answer, source: "auto" });
    } catch (createError) {
      // P2002 = unique constraint (FAQ already exists) — safe to ignore
      const code =
        createError && typeof createError === "object"
          ? Reflect.get(createError as object, "code")
          : null;
      if (code !== "P2002") {
        console.error("[auto-faq] failed to create FAQ", createError);
      }
    }
  } catch (error) {
    console.error("[auto-faq] failed", error);
  }
};



const AUDIO_TAG_REGEX = /\[AUDIO:(\d+)]/;

const parseAudioTag = (
  text: string,
): { audioId: number; textWithoutTag: string } | null => {
  const match = AUDIO_TAG_REGEX.exec(text);
  if (!match) return null;

  const textWithoutTag = `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    audioId: Number(match[1]),
    textWithoutTag,
  };
};

type ResolvedInboundContent = {
  storedBody: string;
  userText: string;
  previewText: string;
  kind: "text" | "audio" | "image" | "attachment";
  imageSummary?: string;
};

const IMAGE_MIME_TYPE_EXTENSIONS: Record<string, string> = {
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const sanitizeStorageSegment = (value: string): string =>
  value.replace(/[^a-zA-Z0-9._-]/g, "_");

const describeInboundImage = (caption?: string | null): string => {
  const normalizedCaption = caption?.trim();
  return normalizedCaption
    ? `Imagem recebida: ${normalizedCaption}`
    : "Imagem recebida";
};

const buildImageFallbackReply = (
  channel: "whatsapp" | "instagram",
  imageSummary?: string,
): string => {
  const normalizedSummary = imageSummary?.trim();
  const summaryPart = normalizedSummary
    ? ` Resumo rapido: ${normalizedSummary}.`
    : "";

  if (channel === "instagram") {
    return `Recebi sua imagem.${summaryPart} Se puder, me conta em texto o que voce quer que eu confira nela.`;
  }

  return `Recebi sua imagem.${summaryPart} Se puder, me explica em texto o que voce precisa para eu te ajudar melhor.`;
};

const hasUsableImageSummary = (value?: string | null): boolean => {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return false;
  return !/^imagem recebida sem detalhes claros[.!]?$/i.test(normalized);
};

const buildInboundImageUserText = (
  caption?: string | null,
  imageSummary?: string | null,
): string => {
  const normalizedCaption = caption?.trim() ?? "";
  const normalizedSummary = imageSummary?.trim() ?? "";
  const usableSummary = hasUsableImageSummary(normalizedSummary)
    ? normalizedSummary
    : "";

  if (normalizedCaption && usableSummary) {
    return [
      `Mensagem do usuario sobre a imagem: ${normalizedCaption}`,
      `Conteudo visivel na imagem: ${usableSummary}`,
    ].join("\n");
  }

  if (normalizedCaption) return normalizedCaption;
  if (usableSummary) return `Imagem enviada pelo usuario. Conteudo visivel: ${usableSummary}`;
  return "";
};

const buildInboundImageLabel = (
  caption?: string | null,
  imageSummary?: string | null,
): string => {
  const normalizedCaption = caption?.trim() ?? "";
  const normalizedSummary = imageSummary?.trim() ?? "";
  const usableSummary = hasUsableImageSummary(normalizedSummary)
    ? normalizedSummary
    : "";

  if (normalizedCaption && usableSummary) {
    return `Legenda: ${normalizedCaption} | Conteudo visivel: ${usableSummary}`;
  }

  return normalizedCaption || usableSummary;
};

const imageExtensionForMimeType = (mimeType?: string | null): string => {
  const normalized = mimeType?.trim().toLowerCase();
  if (!normalized) return "jpg";
  return IMAGE_MIME_TYPE_EXTENSIONS[normalized] ?? "jpg";
};

const buildInboundImageStorageKey = (
  channel: "whatsapp" | "instagram",
  messageId: string,
  fileName: string,
): string =>
  [
    "messages",
    channel,
    "images",
    `${Date.now()}_${sanitizeStorageSegment(messageId)}_${sanitizeStorageSegment(fileName)}`,
  ].join("/");

const uploadInboundImageToR2 = async (input: {
  channel: "whatsapp" | "instagram";
  messageId: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}): Promise<string | null> => {
  try {
    const r2Key = buildInboundImageStorageKey(
      input.channel,
      input.messageId,
      input.fileName,
    );
    return await uploadFileToR2(r2Key, input.bytes, input.mimeType);
  } catch (error) {
    console.warn(
      `[media:${input.channel}:${input.messageId}] failed to upload inbound image`,
      error,
    );
    return null;
  }
};

const resolveWhatsAppInboundContent = async (
  message: InboundMessage,
  prisma?: PrismaClient,
): Promise<ResolvedInboundContent> => {
  if (message.type === "text") {
    return {
      storedBody: message.text,
      userText: message.text,
      previewText: message.text,
      kind: "text",
    };
  }

  if (message.type === "audio") {
    const media = await whatsapp.downloadMedia(message.mediaId, message.mimeType);
    const transcript = await openAI.transcribeAudio(media);
    return {
      storedBody: transcript,
      userText: transcript,
      previewText: transcript,
      kind: "audio",
    };
  }

  const media = await whatsapp.downloadMedia(message.mediaId, message.mimeType);
  const mediaBytes = new Uint8Array(media.arrayBuffer);
  const normalizedCaption = message.caption?.trim() ?? "";
  const imageSummary = await openAI.summarizeInboundImage(
    {
      bytes: mediaBytes,
      mimeType: media.mimeType,
      caption: normalizedCaption,
    },
    prisma,
  );
  const imageLabel = buildInboundImageLabel(normalizedCaption, imageSummary);
  const userText = buildInboundImageUserText(normalizedCaption, imageSummary);
  const imageUrl = await uploadInboundImageToR2({
    channel: "whatsapp",
    messageId: message.messageId,
    fileName: media.fileName,
    mimeType: media.mimeType,
    bytes: mediaBytes,
  });
  const storedBody = imageUrl
    ? buildImageMessageBody(imageUrl, imageLabel)
    : describeInboundImage(imageLabel);

  return {
    storedBody,
    userText,
    previewText: sanitizeMessageBodyForPreview(storedBody),
    kind: "image",
    imageSummary,
  };
};

const resolveInstagramInboundContent = async (
  message: InstagramInboundMessage,
  prisma?: PrismaClient,
): Promise<ResolvedInboundContent> => {
  const rawUserText = message.text?.trim() ?? "";
  const imageAttachment = message.attachments.find(
    (attachment) =>
      Boolean(attachment.url) &&
      (!attachment.type || attachment.type.toLowerCase() === "image"),
  );

  if (imageAttachment?.url) {
    const attachmentTitle = imageAttachment.title?.trim() ?? "";
    let imageSummary = "";
    let imageLabel = buildInboundImageLabel(rawUserText, attachmentTitle);
    let storedBody = describeInboundImage(imageLabel);
    let userText = rawUserText;

    try {
      const imageResponse = await fetch(imageAttachment.url);
      if (!imageResponse.ok) {
        throw new Error(`download failed (${imageResponse.status})`);
      }

      const mimeType =
        imageResponse.headers.get("content-type")?.split(";")[0]?.trim() ||
        "image/jpeg";
      const imageBytes = new Uint8Array(await imageResponse.arrayBuffer());
      imageSummary = await openAI.summarizeInboundImage(
        {
          bytes: imageBytes,
          mimeType,
          caption: rawUserText || attachmentTitle,
        },
        prisma,
      );
      imageLabel = buildInboundImageLabel(rawUserText || attachmentTitle, imageSummary);
      userText = buildInboundImageUserText(rawUserText || attachmentTitle, imageSummary);
      storedBody = describeInboundImage(imageLabel);
      const fileName = `instagram-${message.messageId}.${imageExtensionForMimeType(
        mimeType,
      )}`;
      const uploadedImageUrl = await uploadInboundImageToR2({
        channel: "instagram",
        messageId: message.messageId,
        fileName,
        mimeType,
        bytes: imageBytes,
      });

      if (uploadedImageUrl) {
        storedBody = buildImageMessageBody(uploadedImageUrl, imageLabel);
      }
    } catch (error) {
      console.warn(
        `[media:instagram:${message.messageId}] failed to cache inbound image`,
        error,
      );
    }

    return {
      storedBody,
      userText,
      previewText: sanitizeMessageBodyForPreview(storedBody),
      kind: "image",
      imageSummary,
    };
  }

  const storedBody = rawUserText || (message.hasAttachments ? "Midia recebida" : "");
  return {
    storedBody,
    userText: rawUserText,
    previewText: sanitizeMessageBodyForPreview(storedBody || "Midia recebida"),
    kind: message.hasAttachments ? "attachment" : "text",
  };
};

const getDb = async (req: Request): Promise<{ prisma: PrismaClient } | Response> => {
  const prisma = await getPrismaClient();
  if (!prisma) {
    return json(
      { error: "Database disabled. Set ENABLE_DB=true to use auth/dashboard." },
      503,
      req,
    );
  }

  return { prisma };
};

const persistTurn = async (
  contactKey: string,
  role: "user" | "assistant",
  content: string,
  options?: {
    externalMessageId?: string;
    contactName?: string;
    source?: MessageSourceValue;
    sentByUserId?: string | null;
    channel?: ContactChannelValue;
    externalId?: string | null;
    externalThreadId?: string | null;
    platformHandle?: string | null;
    instagramConnectionId?: string | null;
  },
): Promise<void> => {
  const prisma = await getPrismaClient();
  if (!prisma) return;

  try {
    const channel = inferContactChannel(options?.channel, contactKey);
    const externalId = resolveContactExternalId(
      contactKey,
      channel,
      options?.externalId,
    );
    const contactUpsertData: Prisma.ContactUncheckedCreateInput = {
      waId: contactKey,
      channel,
      externalId: externalId || null,
      name: options?.contactName || null,
      lastInteractionAt: new Date(),
    };
    const contactUpdateData: Prisma.ContactUncheckedUpdateInput = {
      channel,
      externalId: externalId || null,
      lastInteractionAt: new Date(),
    };

    if (options?.externalThreadId !== undefined) {
      contactUpsertData.externalThreadId = options.externalThreadId;
      contactUpdateData.externalThreadId = options.externalThreadId;
    }
    if (options?.platformHandle !== undefined) {
      contactUpsertData.platformHandle = options.platformHandle;
      contactUpdateData.platformHandle = options.platformHandle;
    }
    if (options?.instagramConnectionId !== undefined) {
      contactUpsertData.instagramConnectionId = options.instagramConnectionId;
      contactUpdateData.instagramConnectionId = options.instagramConnectionId;
    }

    const contact = await prisma.contact.upsert({
      where: { waId: contactKey },
      update: contactUpdateData,
      create: contactUpsertData,
    });

    if (
      options?.contactName &&
      options.contactName.trim() &&
      (contact.name ?? "").trim().toLowerCase() !== options.contactName.trim().toLowerCase()
    ) {
      await prisma.contact.update({
        where: { id: contact.id },
        data: { name: options.contactName.trim() },
      });
    }

    const direction = role === "user" ? "in" : "out";
    const source = options?.source ?? (role === "user" ? "USER" : "AI");
    const waMessageId = direction === "in" ? options?.externalMessageId : undefined;

    if (waMessageId) {
      const existing = await prisma.message.findFirst({
        where: {
          contactId: contact.id,
          waMessageId,
        },
        select: { id: true },
      });
      if (existing) return;
    }

    await prisma.message.create({
      data: {
        contactId: contact.id,
        direction,
        source,
        body: content,
        sentByUserId: options?.sentByUserId ?? null,
        waMessageId,
      },
    });
    void invalidateDashboardCaches();
  } catch (error) {
    console.error(`[phone:${contactKey}] failed to persist ${role} turn`, error);
  }
};

const buildResumePendingContext = (
  pendingMessages: ResumePendingMessage[],
): {
  latestMessage: string;
  latestMessageId: string | null;
  latestCreatedAt: Date;
  mergedCount: number;
  mergedPlainText: string;
  prompt: string;
} | null => {
  const normalized = pendingMessages
    .map((message) => ({
      ...message,
      body: sanitizeMessageBodyForAi(message.body.trim()),
    }))
    .filter((message) => message.body && message.body !== "[mensagem nao processada]")
    .slice(-MAX_RESUME_PENDING_MESSAGES);

  if (!normalized.length) return null;

  let keptMessages = [...normalized];
  const renderPrompt = (messages: ResumePendingMessage[]): string => {
    const latest = messages[messages.length - 1];
    const latestBody = latest?.body ?? "";
    return [
      "O bot foi retomado apos uma pausa ou handoff.",
      "Estas foram as mensagens mais recentes do usuario que ficaram sem resposta. Considere TODO o bloco antes de responder.",
      ...messages.map((message, index) => `${index + 1}. ${message.body}`),
      `Pendencia mais recente e prioridade atual: ${latestBody}`,
      "Responda com base no bloco inteiro acima e nao peca para o usuario repetir o que ja informou.",
    ].join("\n");
  };

  while (keptMessages.length > 1 && renderPrompt(keptMessages).length > MAX_RESUME_PENDING_CONTEXT_CHARS) {
    keptMessages = keptMessages.slice(1);
  }

  const latest = keptMessages[keptMessages.length - 1];
  if (!latest) return null;
  return {
    latestMessage: latest.body,
    latestMessageId: latest.waMessageId ?? null,
    latestCreatedAt: latest.createdAt,
    mergedCount: keptMessages.length,
    mergedPlainText: keptMessages.map((message) => message.body).join("\n"),
    prompt: renderPrompt(keptMessages),
  };
};

const canBotAutoReply = async (
  prisma: PrismaClient,
  waId: string,
): Promise<boolean> => {
  const contact = await prisma.contact.findUnique({
    where: { waId },
    select: {
      botEnabled: true,
      handoffRequested: true,
    },
  });

  return Boolean(contact?.botEnabled && !contact.handoffRequested);
};

const hasOutboundAfter = async (
  prisma: PrismaClient,
  contactId: number,
  createdAt: Date,
): Promise<boolean> => {
  const newerOutbound = await prisma.message.findFirst({
    where: {
      contactId,
      direction: "out",
      createdAt: { gt: createdAt },
    },
    select: { id: true },
  });

  return Boolean(newerOutbound);
};

const canResumeAutoReply = async (
  prisma: PrismaClient,
  waId: string,
  contactId: number,
  latestPendingCreatedAt: Date,
): Promise<boolean> => {
  if (!await canBotAutoReply(prisma, waId)) {
    return false;
  }

  return !await hasOutboundAfter(prisma, contactId, latestPendingCreatedAt);
};

const replyPendingContactAfterBotResume = async (
  prisma: PrismaClient,
  waId: string,
): Promise<void> => {
  if (resumedBotReplyLocks.has(waId)) return;
  resumedBotReplyLocks.add(waId);

  try {
    let contact = await prisma.contact.findUnique({
      where: { waId },
      select: resumedReplyContactSelect,
    });
    if (!contact || !contact.botEnabled || contact.handoffRequested) {
      return;
    }

    const lastOutbound = await prisma.message.findFirst({
      where: {
        contactId: contact.id,
        direction: "out",
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        createdAt: true,
      },
    });

    const pendingInboundMessages = await prisma.message.findMany({
      where: {
        contactId: contact.id,
        direction: "in",
        ...(lastOutbound ? { createdAt: { gt: lastOutbound.createdAt } } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: MAX_RESUME_PENDING_MESSAGES,
      select: {
        body: true,
        waMessageId: true,
        createdAt: true,
      },
    });

    const resumeBacklog = buildResumePendingContext(pendingInboundMessages.reverse());
    if (!resumeBacklog) {
      return;
    }
    if (resumeBacklog.mergedCount === 1 && isGreetingOnlyMessage(resumeBacklog.latestMessage)) {
      const greetingReply = buildGreetingReply(contact.name);
      if (shouldSuppressRecentAutoReply(waId, greetingReply)) {
        broadcast("ai:done", { phone: waId });
        return;
      }
      if (await hasOutboundAfter(prisma, contact.id, resumeBacklog.latestCreatedAt)) {
        broadcast("ai:done", { phone: waId });
        return;
      }
      await sendTypingIndicatorToTarget(contact, resumeBacklog.latestMessageId, "text");
      await sleep(computeReplyDelayMs(greetingReply));
      await sendTextToTarget(contact, greetingReply);
      rememberRecentAutoReply(waId, greetingReply);
      await persistTurn(waId, "assistant", greetingReply, {
        source: "AI",
        channel: inferContactChannel(contact.channel, waId),
        externalId: contact.externalId,
      });
      broadcast("message:new", {
        phone: waId,
        role: "assistant",
        source: "AI",
        content: greetingReply,
      });
      broadcast("ai:done", { phone: waId });
      return;
    }
    const pendingMessageId = resumeBacklog.latestMessageId;
    const resumeMergedText = resumeBacklog.mergedPlainText;
    console.log(
      `[resume-reply] backlog ready for ${waId} pending_messages=${resumeBacklog.mergedCount}`,
    );

    broadcast("ai:processing", { phone: waId });

    let extraction: Awaited<ReturnType<OpenAIService["extractLeadData"]>> = {};
    try {
      extraction = await openAI.extractLeadData(resumeMergedText, prisma);
    } catch (error) {
      console.warn(`[resume-reply:${waId}] extraction failed`, error);
    }

    const wantsHuman = await resolveHumanHandoffIntent(
      prisma,
      contact.id,
      resumeBacklog.latestMessage,
      extraction,
    );

    const updateData = buildContactUpdateFromExtraction(extraction);
    if (wantsHuman) {
      Object.assign(
        updateData,
        buildQueuedHandoffState(
          extraction.handoffReason ?? "Solicitacao de verificacao humana",
          new Date(),
        ),
      );
    }

    const mergedSnapshot: ContactTriageSnapshot = {
      name: (updateData.name as string | undefined) ?? contact.name,
      email: (updateData.email as string | undefined) ?? contact.email,
      tournament: (updateData.tournament as string | undefined) ?? contact.tournament,
      eventDate: (updateData.eventDate as string | undefined) ?? contact.eventDate,
      category: (updateData.category as string | undefined) ?? contact.category,
      city: (updateData.city as string | undefined) ?? contact.city,
      teamName: (updateData.teamName as string | undefined) ?? contact.teamName,
      playersCount:
        (updateData.playersCount as number | undefined) ??
        contact.playersCount ??
        null,
    };

    const missingFields = computeMissingLeadFields(mergedSnapshot);
    updateData.triageCompleted = missingFields.length === 0;

    if (Object.keys(updateData).length > 0) {
      contact = await prisma.contact.update({
        where: { waId },
        data: updateData,
        select: resumedReplyContactSelect,
      });

      broadcast("contact:updated", {
        waId,
        contact: contact as unknown as Record<string, unknown>,
      });
      void emitAlertsSummary(prisma);

      if (wantsHuman) {
        void openAI.refreshConversationSummary(prisma, contact.id, waId);
      }

      if (updateData.triageCompleted === true && !wantsHuman) {
        void tryAutoQualify(
          prisma,
          contact.id,
          contact.triageCompleted,
          contact.stageId,
        );
      }

      void tryAutoTag(prisma, contact.id, {
        ...mergedSnapshot,
        age: contact.age,
        level: contact.level,
      });
      void tryAdvancedAutoTag(prisma, contact.id, resumeMergedText);
      void updateLeadScore(prisma, contact.id);
    }

    if (wantsHuman) {
      const handoffReply = buildHandoffAcknowledgement();
      if (await hasOutboundAfter(prisma, contact.id, resumeBacklog.latestCreatedAt)) {
        broadcast("ai:done", { phone: waId });
        return;
      }
      await sendTypingIndicatorToTarget(contact, pendingMessageId, "text");
      await sleep(computeReplyDelayMs(handoffReply));
      await sendTextToTarget(contact, handoffReply);
      await persistTurn(waId, "assistant", handoffReply, {
        source: "SYSTEM",
        channel: inferContactChannel(contact.channel, waId),
        externalId: contact.externalId,
      });
      broadcast("message:new", {
        phone: waId,
        role: "assistant",
        source: "SYSTEM",
        content: handoffReply,
      });
      broadcast("ai:done", { phone: waId });
      return;
    }

    const aiReply = await openAI.generateReply(resumeBacklog.latestMessage, prisma, waId, {
      triageMissing: missingFields,
      resumePendingContext: resumeBacklog.prompt,
      resumeMergedUserMessagesCount: resumeBacklog.mergedCount,
      mode: "resume",
    });

    void tryAutoTask(prisma, contact.id, resumeMergedText);

    await sendTypingIndicatorToTarget(contact, pendingMessageId, "text");

    const typingDelay = Math.min(3000, Math.max(800, aiReply.length * 12));
    await sleep(typingDelay);

    if (!await canResumeAutoReply(prisma, waId, contact.id, resumeBacklog.latestCreatedAt)) {
      broadcast("ai:done", { phone: waId });
      return;
    }

    const audioTag = parseAudioTag(aiReply);
    if (audioTag) {
      if (inferContactChannel(contact.channel, waId) === "INSTAGRAM") {
        const fallbackText =
          audioTag.textWithoutTag || aiReply.replace(AUDIO_TAG_REGEX, "").trim() || aiReply;
        await sendTextToTarget(contact, fallbackText);
        await persistTurn(waId, "assistant", fallbackText, {
          source: "AI",
          channel: inferContactChannel(contact.channel, waId),
          externalId: contact.externalId,
        });
        broadcast("message:new", {
          phone: waId,
          role: "assistant",
          source: "AI",
          content: fallbackText,
        });
        broadcast("ai:done", { phone: waId });

        const overview = await dashboard.getOverview(prisma);
        broadcast("overview:updated", overview as unknown as Record<string, unknown>);
        void tryAutoFaq(prisma, waId, resumeMergedText, fallbackText);
        console.log(
          `[resume-reply] answered pending message for ${waId} mode=resume pending_messages=${resumeBacklog.mergedCount}`,
        );
        return;
      }

      const audioRecord = await prisma.audio.findUnique({
        where: { id: audioTag.audioId },
        select: {
          id: true,
          url: true,
          title: true,
          r2Key: true,
          mimeType: true,
          filename: true,
          sizeBytes: true,
        },
      });

      if (audioRecord) {
        if (audioTag.textWithoutTag) {
          await sendTypingIndicatorToTarget(contact, pendingMessageId, "text");
          const textDelay = Math.min(
            3000,
            Math.max(800, audioTag.textWithoutTag.length * 15),
          );
          await sleep(textDelay);
          await sendTextToTarget(contact, audioTag.textWithoutTag);
          await persistTurn(waId, "assistant", audioTag.textWithoutTag, {
            source: "AI",
            channel: inferContactChannel(contact.channel, waId),
            externalId: contact.externalId,
          });
          broadcast("message:new", {
            phone: waId,
            role: "assistant",
            source: "AI",
            content: audioTag.textWithoutTag,
          });
        }

        const estimatedDurationSec = audioRecord.sizeBytes > 0
          ? audioRecord.sizeBytes / 2000
          : 5;
        const recordingDelay = Math.min(
          20000,
          Math.max(3000, estimatedDurationSec * 1000),
        );
        await sendTypingIndicatorToTarget(contact, pendingMessageId, "audio");
        await sleep(recordingDelay);

        try {
          const audioFile = await getObjectFromR2(audioRecord.r2Key);
          const mediaId = await whatsapp.uploadAudioMedia(
            audioFile.body,
            audioRecord.filename,
            audioFile.contentType !== "application/octet-stream"
              ? audioFile.contentType
              : (audioRecord.mimeType ?? "audio/ogg"),
          );
          await whatsapp.sendAudioMessageById(waId, mediaId);
          const persistBody = `[AUDIO:${audioRecord.url}|${audioRecord.title}]`;
          await persistTurn(waId, "assistant", persistBody, {
            source: "AI",
            channel: inferContactChannel(contact.channel, waId),
            externalId: contact.externalId,
          });
          broadcast("message:new", {
            phone: waId,
            role: "assistant",
            source: "AI",
            content: persistBody,
          });
        } catch (audioError) {
          console.error(`[resume-reply:${waId}] failed to send audio`, audioError);
          logWhatsAppPermissionHint(audioError);
          if (isWhatsAppPermissionError(audioError)) {
            throw audioError;
          }
        }
      } else {
        const fallbackText =
          audioTag.textWithoutTag || aiReply.replace(AUDIO_TAG_REGEX, "").trim();
        await sendTextToTarget(contact, fallbackText);
        await persistTurn(waId, "assistant", fallbackText, {
          source: "AI",
          channel: inferContactChannel(contact.channel, waId),
          externalId: contact.externalId,
        });
        broadcast("message:new", {
          phone: waId,
          role: "assistant",
          source: "AI",
          content: fallbackText,
        });
      }
    } else {
      await sendTextToTarget(contact, aiReply);
      await persistTurn(waId, "assistant", aiReply, {
        source: "AI",
        channel: inferContactChannel(contact.channel, waId),
        externalId: contact.externalId,
      });
      broadcast("message:new", {
        phone: waId,
        role: "assistant",
        source: "AI",
        content: aiReply,
      });
    }

    broadcast("ai:done", { phone: waId });

    const overview = await dashboard.getOverview(prisma);
    broadcast("overview:updated", overview as unknown as Record<string, unknown>);
    void tryAutoFaq(prisma, waId, resumeMergedText, aiReply);
    console.log(
      `[resume-reply] answered pending message for ${waId} mode=resume pending_messages=${resumeBacklog.mergedCount}`,
    );
  } catch (error) {
    logWhatsAppPermissionHint(error);
    console.error(`[resume-reply] failed processing pending message for ${waId}`, error);
    broadcast("ai:done", { phone: waId });
  } finally {
    resumedBotReplyLocks.delete(waId);
  }
};

const shouldProcessMessage = (messageId: string): boolean => {
  const now = Date.now();

  for (const [id, seenAt] of processedMessageIds) {
    if (now - seenAt > MESSAGE_ID_TTL_MS) {
      processedMessageIds.delete(id);
    }
  }

  if (processedMessageIds.has(messageId)) {
    return false;
  }

  processedMessageIds.set(messageId, now);
  return true;
};

const RECENT_AUTOREPLY_TTL_MS = 30_000;
const recentAutoReplies = new Map<string, { body: string; sentAt: number }>();

const shouldSuppressRecentAutoReply = (contactKey: string, body: string): boolean => {
  const now = Date.now();

  for (const [key, entry] of recentAutoReplies) {
    if (now - entry.sentAt > RECENT_AUTOREPLY_TTL_MS) {
      recentAutoReplies.delete(key);
    }
  }

  const recent = recentAutoReplies.get(contactKey);
  if (!recent) return false;

  return recent.body === body && now - recent.sentAt <= RECENT_AUTOREPLY_TTL_MS;
};

const rememberRecentAutoReply = (contactKey: string, body: string): void => {
  recentAutoReplies.set(contactKey, {
    body,
    sentAt: Date.now(),
  });
};

const buildContactUpdateFromExtraction = (
  extraction: Awaited<ReturnType<OpenAIService["extractLeadData"]>>,
): Record<string, unknown> => {
  const data: Record<string, unknown> = {};

  if (extraction.name) data.name = extraction.name;
  if (extraction.email) data.email = extraction.email;
  if (extraction.tournament) data.tournament = extraction.tournament;
  if (extraction.eventDate) data.eventDate = extraction.eventDate;
  if (extraction.category) data.category = extraction.category;
  if (extraction.city) data.city = extraction.city;
  if (extraction.teamName) data.teamName = extraction.teamName;
  if (typeof extraction.playersCount === "number" && extraction.playersCount > 0) {
    data.playersCount = extraction.playersCount;
  }

  return data;
};

const webhookVerify = (req: Request, routeChannel: WebhookRouteChannel): Response => {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expectedTokens = resolveWebhookVerifyTokens(routeChannel);

  if (
    mode !== "subscribe" ||
    !challenge ||
    !token ||
    !expectedTokens.includes(token)
  ) {
    return new Response("Forbidden", { status: 403 });
  }

  return new Response(challenge, { status: 200 });
};

const parseBearerToken = (req: Request): string | null => {
  const authorization = req.headers.get("authorization")?.trim();
  if (!authorization) return null;

  const [scheme, token] = authorization.split(/\s+/, 2);
  if (!scheme || scheme.toLowerCase() !== "bearer" || !token) return null;

  return token;
};

const getAuthenticatedUser = async (
  req: Request,
): Promise<
  | {
      prisma: PrismaClient;
      user: PublicUser;
    }
  | Response
> => {
  const token = parseBearerToken(req);
  if (!token) {
    return json({ error: "Missing bearer token" }, 401, req);
  }

  const db = await getDb(req);
  if (db instanceof Response) return db;

  const user = await auth.getUserFromToken(db.prisma, token);
  if (!user) {
    return json({ error: "Invalid or expired token" }, 401, req);
  }

  return { prisma: db.prisma, user };
};

const requirePermission = (
  current: { user: PublicUser },
  req: Request,
  permission: Permission,
  message?: string,
): Response | null => {
  if (!hasPermission(current.user.permissions, permission)) {
    return json({ error: message ?? `Forbidden: missing permission ${permission}` }, 403, req);
  }
  return null;
};

const serializeCustomRole = (
  role: {
    id: string;
    name: string;
    description: string | null;
    permissions: Prisma.JsonValue;
    createdAt: Date;
    updatedAt: Date;
    _count?: { users: number };
  },
) => ({
  id: role.id,
  name: role.name,
  description: role.description,
  permissions: normalizePermissionList(role.permissions),
  usersCount: role._count?.users ?? 0,
  createdAt: role.createdAt.toISOString(),
  updatedAt: role.updatedAt.toISOString(),
});

const buildWhatsAppProfilePayload = async (canEditBusinessProfile: boolean) => {
  const [profile, phoneNumber] = await Promise.all([
    whatsapp.getBusinessProfile(),
    whatsapp.getPhoneNumberProfile(),
  ]);

  return {
    phoneNumber,
    profile,
    capabilities: {
      canEditBusinessProfile,
      canEditDisplayName: false,
      canEditBanner: false,
    },
    limitations: {
      displayName:
        "O nome de exibicao precisa ser alterado no WhatsApp Manager e pode exigir aprovacao da Meta antes do registro do numero.",
      banner:
        "A WhatsApp Cloud API nao expoe banner/capa da conta conectada por endpoint de perfil.",
    },
  };
};

const parseWhatsAppProfileError = (
  error: unknown,
  fallback: string,
): { status: number; message: string } => {
  if (error instanceof WhatsAppApiError) {
    return {
      status: error.status,
      message: error.details ?? error.message,
    };
  }

  return {
    status: 500,
    message: error instanceof Error ? error.message : fallback,
  };
};

const handleWhatsAppProfileGet = async (req: Request): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;

  try {
    const payload = await buildWhatsAppProfilePayload(
      hasPermission(current.user.permissions, PERMISSIONS.WHATSAPP_PROFILE_MANAGE),
    );
    return json(payload, 200, req);
  } catch (error) {
    logWhatsAppPermissionHint(error);
    console.error("handleWhatsAppProfileGet error:", error);
    const parsed = parseWhatsAppProfileError(
      error,
      "Erro ao carregar perfil do WhatsApp",
    );
    return json({ error: parsed.message }, parsed.status, req);
  }
};

const handleWhatsAppProfileUpdate = async (req: Request): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.WHATSAPP_PROFILE_MANAGE);
  if (denied) return denied;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return json({ error: "Invalid form data" }, 400, req);
  }

  const updateInput: {
    about?: string;
    address?: string;
    description?: string;
    email?: string;
    websites?: string[];
    vertical?: string;
    profilePictureHandle?: string;
  } = {};

  for (const field of [
    "about",
    "address",
    "description",
    "email",
    "vertical",
  ] as const) {
    if (!formData.has(field)) continue;
    const rawValue = formData.get(field);
    if (typeof rawValue !== "string") {
      return json({ error: `${field} must be text` }, 400, req);
    }
    updateInput[field] = rawValue.trim();
  }

  if (formData.has("websites")) {
    const rawValue = formData.get("websites");
    if (typeof rawValue !== "string") {
      return json({ error: "websites must be text" }, 400, req);
    }

    let websites: string[] = [];
    const normalized = rawValue.trim();

    if (normalized) {
      try {
        const parsed = JSON.parse(normalized) as unknown;
        websites = Array.isArray(parsed)
          ? parsed
              .map((value) => (typeof value === "string" ? value.trim() : ""))
              .filter(Boolean)
          : [];
      } catch {
        websites = normalized
          .split(/\r?\n|,/)
          .map((value) => value.trim())
          .filter(Boolean);
      }
    }

    updateInput.websites = websites;
  }

  try {
    const profilePhoto = formData.get("profilePhoto");
    if (profilePhoto instanceof File && profilePhoto.size > 0) {
      const mimeType = profilePhoto.type.trim() || "image/jpeg";
      if (!mimeType.startsWith("image/")) {
        return json({ error: "profilePhoto must be an image" }, 400, req);
      }

      const fileBytes = new Uint8Array(await profilePhoto.arrayBuffer());
      const fileName =
        profilePhoto.name?.trim() || `whatsapp-profile-${Date.now()}.jpg`;
      updateInput.profilePictureHandle = await whatsapp.uploadProfilePicture(
        fileBytes,
        fileName,
        mimeType,
      );
    } else if (profilePhoto !== null && !(profilePhoto instanceof File)) {
      return json({ error: "profilePhoto must be a file" }, 400, req);
    }

    if (!Object.keys(updateInput).length) {
      return json({ error: "Nenhum campo valido para atualizar" }, 400, req);
    }

    await whatsapp.updateBusinessProfile(updateInput);
    const payload = await buildWhatsAppProfilePayload(true);
    return json(payload, 200, req);
  } catch (error) {
    logWhatsAppPermissionHint(error);
    console.error("handleWhatsAppProfileUpdate error:", error);
    const parsed = parseWhatsAppProfileError(
      error,
      "Erro ao atualizar perfil do WhatsApp",
    );
    return json({ error: parsed.message }, parsed.status, req);
  }
};

const parseInstagramError = (
  error: unknown,
  fallback: string,
): { status: number; message: string } => {
  if (error instanceof InstagramApiError) {
    return {
      status: error.status,
      message: error.details ?? error.message,
    };
  }

  return {
    status: 500,
    message: error instanceof Error ? error.message : fallback,
  };
};

const buildInstagramConnectionsPayload = async (
  prisma: PrismaClient,
): Promise<Record<string, unknown>> => {
  const connections = await prisma.instagramConnection.findMany({
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      pageId: true,
      pageName: true,
      instagramAccountId: true,
      instagramUsername: true,
      status: true,
      webhookSubscribed: true,
      lastSyncedAt: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          contacts: true,
        },
      },
    },
  });

  return {
    appConfigured: instagram.isConfigured(),
    graphVersion: config.metaGraphVersion,
    requiredScopes: config.instagramScopes,
    callbackUrl: config.metaRedirectUri ?? null,
    webhookPath: `${config.apiBasePath}/webhook/instagram`,
    webhookPaths: {
      instagram: `${config.apiBasePath}/webhook/instagram`,
      whatsapp: `${config.apiBasePath}/webhook/whatsapp`,
      legacy: `${config.apiBasePath}/webhook`,
    },
    prerequisites: {
      appIdConfigured: Boolean(config.instagramAppId),
      appSecretConfigured: Boolean(config.instagramAppSecret),
      redirectUriConfigured: Boolean(config.metaRedirectUri),
      webhookVerifyTokenConfigured: Boolean(config.instagramWebhookVerifyToken),
    },
    connections: connections.map((connection) => {
      const { _count, ...rest } = connection;
      return {
        ...rest,
        connectionMode:
          connection.pageId === connection.instagramAccountId
            ? "INSTAGRAM_LOGIN"
            : "MESSENGER_PAGE",
        contactsCount: _count.contacts,
        lastSyncedAt: connection.lastSyncedAt?.toISOString() ?? null,
        createdAt: connection.createdAt.toISOString(),
        updatedAt: connection.updatedAt.toISOString(),
      };
    }),
  };
};

const finalizeInstagramOauthConnection = async (
  prisma: PrismaClient,
  userAccessToken: string,
  scopes: string[],
): Promise<string> => {
  const normalizedScopes = scopes.length ? scopes : config.instagramScopes;
  const connection = await instagram.resolveConnection(
    userAccessToken,
    normalizedScopes,
  );

  await prisma.instagramConnection.upsert({
    where: { pageId: connection.pageId },
    update: {
      pageName: connection.pageName,
      instagramAccountId: connection.instagramAccountId,
      instagramUsername: connection.instagramUsername,
      pageAccessToken: connection.pageAccessToken,
      scopes: connection.scopes,
      status: "CONNECTED",
      webhookSubscribed: connection.webhookSubscribed,
      lastSyncedAt: new Date(),
    },
    create: {
      pageId: connection.pageId,
      pageName: connection.pageName,
      instagramAccountId: connection.instagramAccountId,
      instagramUsername: connection.instagramUsername,
      pageAccessToken: connection.pageAccessToken,
      scopes: connection.scopes,
      status: "CONNECTED",
      webhookSubscribed: connection.webhookSubscribed,
      lastSyncedAt: new Date(),
    },
  });

  return connection.instagramUsername
    ? `@${connection.instagramUsername} conectado com sucesso.`
    : "Conta conectada com sucesso.";
};

const completeInstagramOauthConnection = async (
  userAccessToken: string,
  state: string,
  scopes: string[],
): Promise<string> => {
  const verifiedState = await verifyInstagramOauthState(state);
  const prisma = await getPrismaClient();
  if (!prisma) {
    throw new Error("Banco desabilitado. Ative ENABLE_DB=true para conectar Instagram.");
  }

  const existingUser = await prisma.user.findUnique({
    where: { id: verifiedState.userId },
    select: { id: true },
  });
  if (!existingUser) {
    throw new Error("Usuario da conexao nao encontrado.");
  }

  return finalizeInstagramOauthConnection(prisma, userAccessToken, scopes);
};

const handleInstagramConnectionsGet = async (req: Request): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.WHATSAPP_PROFILE_VIEW);
  if (denied) return denied;

  const payload = await buildInstagramConnectionsPayload(current.prisma);
  return json(payload, 200, req);
};

const handleInstagramConnectionsCreate = async (req: Request): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.WHATSAPP_PROFILE_MANAGE);
  if (denied) return denied;

  let body: InstagramManualConnectionBody;
  try {
    body = (await req.json()) as InstagramManualConnectionBody;
  } catch {
    return json({ error: "JSON invalido" }, 400, req);
  }

  const accessToken = normalizeMetaAccessToken(body.accessToken);
  if (!accessToken) {
    return json({ error: "accessToken e obrigatorio" }, 400, req);
  }

  try {
    const message = await finalizeInstagramOauthConnection(
      current.prisma,
      accessToken,
      config.instagramScopes,
    );
    return json({ message }, 200, req);
  } catch (error) {
    const parsed = parseInstagramError(
      error,
      "Nao foi possivel conectar a conta do Instagram com esse token.",
    );
    return json({ error: parsed.message }, parsed.status, req);
  }
};

const handleInstagramOauthStart = async (req: Request): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.WHATSAPP_PROFILE_MANAGE);
  if (denied) return denied;

  if (!instagram.isConfigured()) {
    return json(
      {
        error:
          "Integracao da Meta incompleta. Configure INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET e META_REDIRECT_URI.",
      },
      400,
      req,
    );
  }

  const state = await signInstagramOauthState(current.user.id);
  const url = instagram.buildOAuthUrl(state, config.instagramScopes);

  return json({ url }, 200, req);
};

const handleInstagramOauthCallback = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const errorReason = url.searchParams.get("error_reason");
  const errorDescription = url.searchParams.get("error_description");

  if (errorReason) {
    return Response.redirect(
      buildInstagramDashboardRedirect(req, "error", errorDescription ?? errorReason),
      302,
    );
  }

  const accessToken = url.searchParams.get("access_token")?.trim();
  const state = url.searchParams.get("state")?.trim();
  if (accessToken && state) {
    try {
      const message = await completeInstagramOauthConnection(
        accessToken,
        state,
        config.instagramScopes,
      );
      return Response.redirect(
        buildInstagramDashboardRedirect(req, "connected", message),
        302,
      );
    } catch (error) {
      const parsed = parseInstagramError(
        error,
        "Nao foi possivel concluir a conexao com o Instagram.",
      );
      return Response.redirect(
        buildInstagramDashboardRedirect(req, "error", parsed.message),
        302,
      );
    }
  }

  const code = url.searchParams.get("code")?.trim();
  if (!code || !state) {
    return renderInstagramOauthCallbackBridge(req);
  }

  try {
    const userToken = await instagram.exchangeCodeForUserToken(
      code,
      config.instagramScopes,
    );
    const message = await completeInstagramOauthConnection(
      userToken,
      state,
      config.instagramScopes,
    );

    return Response.redirect(
      buildInstagramDashboardRedirect(req, "connected", message),
      302,
    );
  } catch (error) {
    const parsed = parseInstagramError(
      error,
      "Nao foi possivel concluir a conexao com o Instagram.",
    );
    return Response.redirect(
      buildInstagramDashboardRedirect(req, "error", parsed.message),
      302,
    );
  }
};

const handleInstagramOauthCallbackPost = async (
  req: Request,
): Promise<Response> => {
  let body: InstagramOauthCallbackBody;

  try {
    body = (await req.json()) as InstagramOauthCallbackBody;
  } catch {
    return json({ error: "Invalid JSON payload" }, 400, req);
  }

  const accessToken = normalizeMetaAccessToken(body.accessToken);
  const state = typeof body.state === "string" ? body.state.trim() : "";
  const grantedScopes = normalizeInstagramGrantedScopes(body.grantedScopes);

  if (!accessToken || !state) {
    return json({ error: "Callback da Meta incompleto." }, 400, req);
  }

  try {
    const message = await completeInstagramOauthConnection(
      accessToken,
      state,
      grantedScopes,
    );
    return json(
      {
        ok: true,
        redirectUrl: buildInstagramDashboardRedirect(req, "connected", message),
      },
      200,
      req,
    );
  } catch (error) {
    const parsed = parseInstagramError(
      error,
      "Nao foi possivel concluir a conexao com o Instagram.",
    );
    return json(
      {
        error: parsed.message,
        redirectUrl: buildInstagramDashboardRedirect(req, "error", parsed.message),
      },
      parsed.status,
      req,
    );
  }
};

const handleInstagramConnectionDelete = async (
  req: Request,
  connectionId: string,
): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.WHATSAPP_PROFILE_MANAGE);
  if (denied) return denied;

  try {
    await current.prisma.instagramConnection.delete({
      where: { id: connectionId },
    });
  } catch {
    return json({ error: "Conexao nao encontrada" }, 404, req);
  }

  return json({ ok: true }, 200, req);
};

const authLogin = async (req: Request): Promise<Response> => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON payload" }, 400, req);
  }

  const input =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};

  const email = typeof input.email === "string" ? input.email.trim() : "";
  const password = typeof input.password === "string" ? input.password : "";

  if (!email || !password) {
    return json({ error: "email and password are required" }, 400, req);
  }

  const db = await getDb(req);
  if (db instanceof Response) return db;

  await auth.ensureAdminUser(db.prisma);
  const session = await auth.login(db.prisma, email, password);
  if (!session) {
    return json({ error: "Invalid credentials" }, 401, req);
  }

  return json(session, 200, req);
};

const authMe = async (req: Request): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;

  return json({ user: current.user }, 200, req);
};

const handleProfileUpdate = async (req: Request): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;

  const contentType = req.headers.get("content-type") ?? "";

  let name: string | undefined;
  let email: string | undefined;
  let currentPassword: string | undefined;
  let newPassword: string | undefined;
  let avatarFile: File | null = null;

  if (contentType.includes("multipart/form-data")) {
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return json({ error: "Invalid form data" }, 400, req);
    }
    const rawName = formData.get("name");
    if (typeof rawName === "string") name = rawName.trim();
    const rawEmail = formData.get("email");
    if (typeof rawEmail === "string") email = rawEmail.trim().toLowerCase();
    const rawCurrentPassword = formData.get("currentPassword");
    if (typeof rawCurrentPassword === "string") {
      currentPassword = rawCurrentPassword;
    }
    const rawNewPassword = formData.get("newPassword");
    if (typeof rawNewPassword === "string") newPassword = rawNewPassword;
    const file = formData.get("avatar");
    if (file && file instanceof File && file.size > 0) avatarFile = file;
  } else {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400, req);
    }
    const input = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
    if (typeof input.name === "string") name = input.name.trim();
    if (typeof input.email === "string") email = input.email.trim().toLowerCase();
    if (typeof input.currentPassword === "string") {
      currentPassword = input.currentPassword;
    }
    if (typeof input.newPassword === "string") newPassword = input.newPassword;
  }

  const normalizedCurrentPassword = currentPassword ?? "";
  const normalizedNewPassword = newPassword ?? "";
  const wantsEmailChange = email !== undefined && email !== current.user.email;
  const wantsPasswordChange = normalizedNewPassword.length > 0;

  if (wantsEmailChange && (!email || !email.includes("@"))) {
    return json({ error: "Email invalido" }, 400, req);
  }

  if (wantsPasswordChange && normalizedNewPassword.length < 6) {
    return json({ error: "Nova senha deve ter ao menos 6 caracteres" }, 400, req);
  }

  if (wantsEmailChange || wantsPasswordChange) {
    if (!normalizedCurrentPassword) {
      return json(
        { error: "Informe sua senha atual para alterar email ou senha" },
        400,
        req,
      );
    }

    const storedUser = await current.prisma.user.findUnique({
      where: { id: current.user.id },
    });
    if (!storedUser) {
      return json({ error: "Usuario nao encontrado" }, 404, req);
    }

    const isCurrentPasswordValid = await Bun.password.verify(
      normalizedCurrentPassword,
      storedUser.passwordHash,
    );
    if (!isCurrentPasswordValid) {
      return json({ error: "Senha atual incorreta" }, 401, req);
    }
  }

  let avatarUrl: string | undefined;

  if (avatarFile) {
    if (!avatarFile.type.startsWith("image/")) {
      return json({ error: "Avatar deve ser uma imagem" }, 400, req);
    }
    if (avatarFile.size > 2 * 1024 * 1024) {
      return json({ error: "Avatar muito grande (max 2 MB)" }, 400, req);
    }
    const ext = avatarFile.name.split(".").pop() ?? "jpg";
    const r2Key = `avatars/${current.user.id}.${ext}`;
    const buffer = new Uint8Array(await avatarFile.arrayBuffer());
    avatarUrl = await uploadFileToR2(r2Key, buffer, avatarFile.type);
  }

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name || null;
  if (wantsEmailChange) data.email = email;
  if (wantsPasswordChange) {
    data.passwordHash = await Bun.password.hash(normalizedNewPassword);
  }
  if (avatarUrl !== undefined) data.avatarUrl = avatarUrl;

  if (Object.keys(data).length === 0) {
    return json({ error: "Nenhum campo para atualizar" }, 400, req);
  }

  try {
    const updated = await current.prisma.user.update({
      where: { id: current.user.id },
      data,
      include: { customRole: true },
    });

    return json({ user: toPublicUser(updated) }, 200, req);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return json({ error: "Este email ja esta em uso" }, 409, req);
    }
    throw error;
  }
};

const readTrimmedString = (
  input: Record<string, unknown>,
  field: string,
): string | null => {
  const value = input[field];
  if (typeof value !== "string") return null;
  return value.trim();
};

const parseAiSettingsInput = (
  input: Record<string, unknown>,
): { value: AiSettingsInput } | { error: string } => {
  const model = readTrimmedString(input, "model");
  const language = readTrimmedString(input, "language");
  const personality = readTrimmedString(input, "personality");
  const style = readTrimmedString(input, "style");
  const rawSystemPrompt = input.systemPrompt;

  if (!model || model.length < 2) {
    return { error: "Modelo da IA invalido" };
  }
  if (!language || language.length < 2) {
    return { error: "Idioma principal invalido" };
  }
  if (!personality || personality.length < 5) {
    return { error: "Personalidade deve ter ao menos 5 caracteres" };
  }
  if (!style || style.length < 5) {
    return { error: "Estilo de resposta deve ter ao menos 5 caracteres" };
  }
  if (
    rawSystemPrompt !== undefined &&
    rawSystemPrompt !== null &&
    typeof rawSystemPrompt !== "string"
  ) {
    return { error: "Prompt base deve ser texto" };
  }

  const systemPrompt = typeof rawSystemPrompt === "string"
    ? rawSystemPrompt.trim() || null
    : null;

  if (personality.length > 500) {
    return { error: "Personalidade deve ter no maximo 500 caracteres" };
  }
  if (style.length > 500) {
    return { error: "Estilo de resposta deve ter no maximo 500 caracteres" };
  }
  if (systemPrompt && systemPrompt.length > 8000) {
    return { error: "Prompt base deve ter no maximo 8000 caracteres" };
  }

  return {
    value: {
      model,
      language,
      personality,
      style,
      systemPrompt,
    },
  };
};

const handleAiSettingsGet = async (req: Request): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.USERS_MANAGE);
  if (denied) return denied;

  const settings = await resolveAiSettings(current.prisma);
  return json(settings, 200, req);
};

const handleAiSettingsUpdate = async (req: Request): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.USERS_MANAGE);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, req);
  }

  const input = typeof body === "object" && body !== null
    ? (body as Record<string, unknown>)
    : {};
  const parsed = parseAiSettingsInput(input);
  if ("error" in parsed) {
    return json({ error: parsed.error }, 400, req);
  }

  const saved = await saveAiSettings(current.prisma, parsed.value);
  return json(saved, 200, req);
};

const dashboardOverview = async (req: Request): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.DASHBOARD_VIEW);
  if (denied) return denied;

  const cacheKey = `${DASHBOARD_CACHE_PREFIX}overview`;
  const cached = await cacheGetJson<Awaited<ReturnType<DashboardService["getOverview"]>>>(
    cacheKey,
  );
  if (cached) {
    return json(cached, 200, req);
  }

  const overview = await dashboard.getOverview(current.prisma);
  void cacheSetJson(cacheKey, overview, DASHBOARD_CACHE_TTL_SECONDS);
  return json(overview, 200, req);
};

const dashboardAlerts = async (req: Request): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.DASHBOARD_VIEW);
  if (denied) return denied;

  const cacheKey = `${DASHBOARD_CACHE_PREFIX}alerts`;
  const cached = await cacheGetJson<OperationalAlertsSummary>(cacheKey);
  if (cached) {
    return json(cached, 200, req);
  }

  const summary = await getOperationalAlertsSummary(current.prisma);
  void cacheSetJson(cacheKey, summary, DASHBOARD_CACHE_TTL_SECONDS);
  return json(summary, 200, req);
};

const dashboardConversations = async (req: Request): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.CONVERSATIONS_VIEW);
  if (denied) return denied;

  const url = new URL(req.url);
  const limitParam = url.searchParams.get("limit");
  const limit = Math.min(
    100,
    Math.max(1, Number.isFinite(Number(limitParam)) ? Number(limitParam) : 25),
  );

  const cacheKey = `${DASHBOARD_CACHE_PREFIX}conversations:${limit}`;
  const cached = await cacheGetJson<Awaited<ReturnType<DashboardService["getConversations"]>>>(
    cacheKey,
  );
  if (cached) {
    return json(cached, 200, req);
  }

  const conversations = await dashboard.getConversations(current.prisma, limit);
  void cacheSetJson(cacheKey, conversations, DASHBOARD_CACHE_TTL_SECONDS);
  return json(conversations, 200, req);
};

const dashboardConversationTurns = async (req: Request): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.CONVERSATIONS_VIEW);
  if (denied) return denied;

  const url = new URL(req.url);
  const prefix = `${config.apiBasePath}/dashboard/conversations/`;
  const fallbackPrefix = "/dashboard/conversations/";
  const workingPath = url.pathname.startsWith(prefix)
    ? url.pathname.slice(prefix.length)
    : url.pathname.startsWith(fallbackPrefix)
      ? url.pathname.slice(fallbackPrefix.length)
      : "";

  if (!workingPath.endsWith("/turns")) {
    return json({ error: "Not found" }, 404, req);
  }

  const phone = decodeURIComponent(
    workingPath.slice(0, Math.max(0, workingPath.length - "/turns".length)),
  ).trim();

  if (!phone) {
    return json({ error: "phone is required" }, 400, req);
  }

  const limitParam = url.searchParams.get("limit");
  const limit = Math.min(
    200,
    Math.max(1, Number.isFinite(Number(limitParam)) ? Number(limitParam) : 40),
  );
  const offsetParam = url.searchParams.get("offset");
  const offset = Math.max(
    0,
    Number.isFinite(Number(offsetParam)) ? Number(offsetParam) : 0,
  );

  const turns = await dashboard.getConversationTurns(current.prisma, phone, limit, offset);
  return json(turns, 200, req);
};

const dashboardCacheMetrics = async (req: Request): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.DASHBOARD_VIEW);
  if (denied) return denied;

  return json(
    {
      metrics: getCacheMetrics(),
      cachePrefix: DASHBOARD_CACHE_PREFIX,
      ttlSeconds: {
        dashboard: DASHBOARD_CACHE_TTL_SECONDS,
        pipeline: PIPELINE_CACHE_TTL_SECONDS,
      },
      user: current.user.email,
    },
    200,
    req,
  );
};

// ── Funnel metrics by pipeline stage ─────────────────────────
const handleFunnelMetrics = async (req: Request): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.PIPELINE_VIEW);
  if (denied) return denied;

  const stages = await current.prisma.pipelineStage.findMany({
    orderBy: { position: "asc" },
    select: { id: true, name: true },
  });

  const result = await Promise.all(
    stages.map(async (stage) => {
      const total = await current.prisma.contact.count({ where: { stageId: stage.id } });
      const won = await current.prisma.contact.count({ where: { stageId: stage.id, leadStatus: "won" } });
      const lost = await current.prisma.contact.count({ where: { stageId: stage.id, leadStatus: "lost" } });
      const avgTime = await current.prisma.$queryRawUnsafe<Array<{ avg_hours: number | null }>>(
        `SELECT AVG(EXTRACT(EPOCH FROM (NOW() - "createdAt")) / 3600) as avg_hours FROM "Contact" WHERE "stageId" = $1`,
        stage.id,
      );
      return {
        stageId: stage.id,
        stageName: stage.name,
        total,
        won,
        lost,
        conversionRate: total > 0 ? Math.round((won / total) * 100) : 0,
        avgHoursInStage: avgTime[0]?.avg_hours ? Math.round(avgTime[0].avg_hours) : null,
      };
    }),
  );

  return json(result, 200, req);
};

const whatsappWebhookEvent = async (
  payload: WhatsAppWebhookPayload,
): Promise<Response> => {
  console.log("[webhook] received event payload entries:", payload.entry?.length ?? 0);

  const inbound = extractInboundMessages(payload);
  console.log("[webhook] extracted inbound messages:", inbound.length);

  void (async () => {
    for (const message of inbound) {
      if (!shouldProcessMessage(message.messageId)) {
        console.log(`[webhook] skipping duplicate message ${message.messageId}`);
        continue;
      }
      console.log(`[webhook] processing message from ${message.from} (${message.type})`);


      try {
        let skipProcessing = false;
        const prisma = (await getPrismaClient()) ?? undefined;
        try {
          // Only mark as read if bot is still active for this contact
          const prismaForRead = await getPrismaClient();
          if (prismaForRead) {
            const contactForRead = await prismaForRead.contact.findUnique({
              where: { waId: message.from },
              select: { botEnabled: true, handoffRequested: true },
            });
            if (contactForRead && !contactForRead.botEnabled) {
              // Don't mark as read — handoff is active, let the human agent handle it
              skipProcessing = true;
            } else {
              await whatsapp.markAsRead(message.messageId);
              await whatsapp.sendTypingIndicator(message.messageId, "text");
            }
          } else {
            await whatsapp.markAsRead(message.messageId);
            await whatsapp.sendTypingIndicator(message.messageId, "text");
          }
        } catch (error) {
          console.warn(
            `[message:${message.messageId}] could not mark as read`,
            error,
          );
        }

        const inboundContent = await resolveWhatsAppInboundContent(message, prisma);
        const storedBody = inboundContent.storedBody.trim() || "[mensagem nao processada]";
        const userText = inboundContent.userText.trim();
        const shouldPersistInboundMessage =
          Boolean(userText) || inboundContent.kind === "image" || inboundContent.kind === "attachment";

        if (skipProcessing) {
          await persistTurn(
            message.from,
            "user",
            storedBody,
            {
              externalMessageId: message.messageId,
              contactName: message.contactName,
              source: "USER",
            },
          );
          broadcast("message:new", {
            phone: message.from,
            role: "user",
            source: "USER",
            content: storedBody,
          });
          continue;
        }

        if (shouldPersistInboundMessage) {
          await persistTurn(
            message.from,
            "user",
            storedBody,
            {
              externalMessageId: message.messageId,
              contactName: message.contactName,
              source: "USER",
            },
          );

          broadcast("message:new", {
            phone: message.from,
            role: "user",
            source: "USER",
            content: storedBody,
          });

          broadcast("notification", {
            phone: message.from,
            name: message.contactName ?? null,
            messageId: message.messageId,
            preview: inboundContent.previewText.slice(0, 120),
          });
        }

        if (!userText) {
          const fallbackReply =
            inboundContent.kind === "image"
              ? buildImageFallbackReply("whatsapp", inboundContent.imageSummary)
              : "Nao consegui entender o audio. Pode enviar novamente ou mandar em texto?";
          await whatsapp.sendTextMessage(
            message.from,
            fallbackReply,
          );
          await persistTurn(message.from, "assistant", fallbackReply, {
            source: "SYSTEM",
          });
          broadcast("message:new", {
            phone: message.from,
            role: "assistant",
            source: "SYSTEM",
            content: fallbackReply,
          });
          broadcast("ai:done", { phone: message.from });
          continue;
        }

        // Emit WS events: new user message + AI processing
        broadcast("ai:processing", { phone: message.from });

        if (isGreetingOnlyMessage(userText)) {
          const greetingReply = buildGreetingReply();
          const prismaForGreeting = await getPrismaClient();
          if (prismaForGreeting) {
            const latestContact = await prismaForGreeting.contact.findUnique({
              where: { waId: message.from },
              select: { botEnabled: true, name: true },
            });
            if (latestContact && !latestContact.botEnabled) {
              broadcast("ai:done", { phone: message.from });
              continue;
            }
            if (latestContact) {
              const personalizedGreetingReply = buildGreetingReply(latestContact.name);
              if (shouldSuppressRecentAutoReply(message.from, personalizedGreetingReply)) {
                broadcast("ai:done", { phone: message.from });
                continue;
              }

              await sleep(computeReplyDelayMs(personalizedGreetingReply));
              await whatsapp.sendTextMessage(message.from, personalizedGreetingReply);
              rememberRecentAutoReply(message.from, personalizedGreetingReply);
              await persistTurn(message.from, "assistant", personalizedGreetingReply, { source: "AI" });
              broadcast("message:new", {
                phone: message.from,
                role: "assistant",
                source: "AI",
                content: personalizedGreetingReply,
              });
              broadcast("ai:done", { phone: message.from });
              continue;
            }
          }
          if (shouldSuppressRecentAutoReply(message.from, greetingReply)) {
            broadcast("ai:done", { phone: message.from });
            continue;
          }

          await sleep(computeReplyDelayMs(greetingReply));
          await whatsapp.sendTextMessage(message.from, greetingReply);
          rememberRecentAutoReply(message.from, greetingReply);
          await persistTurn(message.from, "assistant", greetingReply, { source: "AI" });
          broadcast("message:new", {
            phone: message.from,
            role: "assistant",
            source: "AI",
            content: greetingReply,
          });
          broadcast("ai:done", { phone: message.from });
          continue;
        }

        let aiReply: string;

        // FAQ Feedback Loop + Semantic Reply Cache: check for repeated/similar question
        const cachedReply =
          (await tryFaqFeedbackCache(userText)) ??
          (await trySemanticReplyCache(userText));
        if (cachedReply && prisma) {
          const latestContact = await prisma.contact.findUnique({
            where: { waId: message.from },
            select: { botEnabled: true },
          });
          if (latestContact && latestContact.botEnabled) {
            const typingDelay = Math.min(2000, Math.max(500, cachedReply.length * 15));
            await sleep(typingDelay);
            await whatsapp.sendTextMessage(message.from, cachedReply);
            await persistTurn(message.from, "assistant", cachedReply, { source: "AI" });
            broadcast("message:new", {
              phone: message.from,
              role: "assistant",
              source: "AI",
              content: cachedReply,
            });
            broadcast("ai:done", { phone: message.from });
            console.log(`[cache-reply] served cached reply to ${message.from}`);
            continue;
          }
        }

        if (prisma) {
          let contact = await prisma.contact.findUnique({ where: { waId: message.from } });
          if (contact && !contact.botEnabled) {
            broadcast("ai:done", { phone: message.from });
            continue;
          }
          if (!contact) {
            console.warn(`[phone:${message.from}] contact not found after inbound persist`);
            broadcast("ai:done", { phone: message.from });
            continue;
          }

          let extraction: Awaited<ReturnType<OpenAIService["extractLeadData"]>> = {};
          try {
            extraction = await openAI.extractLeadData(userText, prisma);
          } catch (error) {
            console.warn(`[phone:${message.from}] extraction failed`, error);
          }

          const wantsHuman = await resolveHumanHandoffIntent(
            prisma,
            contact.id,
            userText,
            extraction,
          );

          const updateData = buildContactUpdateFromExtraction(extraction);
          if (wantsHuman) {
            Object.assign(
              updateData,
              buildQueuedHandoffState(
                extraction.handoffReason ?? "Solicitacao de verificacao humana",
                new Date(),
              ),
            );
          }

          const mergedSnapshot: ContactTriageSnapshot = {
            name: (updateData.name as string | undefined) ?? contact?.name,
            email: (updateData.email as string | undefined) ?? contact?.email,
            tournament:
              (updateData.tournament as string | undefined) ?? contact?.tournament,
            eventDate:
              (updateData.eventDate as string | undefined) ?? contact?.eventDate,
            category: (updateData.category as string | undefined) ?? contact?.category,
            city: (updateData.city as string | undefined) ?? contact?.city,
            teamName: (updateData.teamName as string | undefined) ?? contact?.teamName,
            playersCount:
              (updateData.playersCount as number | undefined) ??
              contact?.playersCount ??
              null,
          };

          const missingFields = computeMissingLeadFields(mergedSnapshot);
          updateData.triageCompleted = missingFields.length === 0;

          if (Object.keys(updateData).length > 0) {
            contact = await prisma.contact.update({
              where: { waId: message.from },
              data: updateData,
            });

            broadcast("contact:updated", {
              waId: message.from,
              contact: contact as unknown as Record<string, unknown>,
            });
            void emitAlertsSummary(prisma);
            if (wantsHuman) {
              void openAI.refreshConversationSummary(prisma, contact.id, message.from);
            }

            // Auto-qualify if triage just completed
            if (updateData.triageCompleted === true && !wantsHuman) {
              void tryAutoQualify(
                prisma,
                contact.id,
                contact.triageCompleted,
                contact.stageId,
              );
            }

            // Auto-tag based on extracted data
            void tryAutoTag(prisma, contact.id, {
              ...mergedSnapshot,
              age: contact.age,
              level: contact.level,
            });

            // Phase 5: Advanced game/context auto-tagging
            void tryAdvancedAutoTag(prisma, contact.id, userText);

            // Phase 6: Recompute lead score
            void updateLeadScore(prisma, contact.id);
          }

          if (wantsHuman) {
            const handoffReply = buildHandoffAcknowledgement();
            await sleep(computeReplyDelayMs(handoffReply));
            await whatsapp.sendTextMessage(message.from, handoffReply);
            await persistTurn(message.from, "assistant", handoffReply, {
              source: "SYSTEM",
            });
            broadcast("message:new", {
              phone: message.from,
              role: "assistant",
              source: "SYSTEM",
              content: handoffReply,
            });
            broadcast("ai:done", { phone: message.from });
            continue;
          }

          aiReply = await openAI.generateReply(userText, prisma, message.from, {
            triageMissing: missingFields,
          });

          // Auto-detect task/reminder intent (fire-and-forget)
          if (contact) {
            void tryAutoTask(prisma, contact.id, userText);
          }
        } else {
          aiReply = await openAI.generateReply(userText);
        }

        // Natural delay that simulates reading + typing (typing indicator already active)
        const typingDelay = Math.min(3000, Math.max(800, aiReply.length * 12));
        await sleep(typingDelay);

        if (prisma) {
          const latestContact = await prisma.contact.findUnique({
            where: { waId: message.from },
            select: { botEnabled: true },
          });
          if (latestContact && !latestContact.botEnabled) {
            broadcast("ai:done", { phone: message.from });
            continue;
          }
        }

        // Check if AI wants to send an audio file
        const audioTag = parseAudioTag(aiReply);
        if (audioTag && prisma) {
          const audioRecord = await prisma.audio.findUnique({
            where: { id: audioTag.audioId },
            select: {
              id: true,
              url: true,
              title: true,
              r2Key: true,
              mimeType: true,
              filename: true,
              sizeBytes: true,
            },
          });
          if (audioRecord) {
            // Send the text part first (with "Digitando..." indicator)
            if (audioTag.textWithoutTag) {
              await whatsapp.sendTypingIndicator(message.messageId, "text");
              const textDelay = Math.min(3000, Math.max(800, audioTag.textWithoutTag.length * 15));
              await sleep(textDelay);
              await whatsapp.sendTextMessage(message.from, audioTag.textWithoutTag);
              await persistTurn(message.from, "assistant", audioTag.textWithoutTag, {
                source: "AI",
              });
              broadcast("message:new", {
                phone: message.from,
                role: "assistant",
                source: "AI",
                content: audioTag.textWithoutTag,
              });
            }

            // Now show "Gravando..." and hold it for a realistic delay before sending audio
            // Estimate audio duration from file size (~16kbps for WhatsApp ogg voice)
            const estimatedDurationSec = audioRecord.sizeBytes > 0
              ? audioRecord.sizeBytes / 2000
              : 5;
            const recordingDelay = Math.min(20000, Math.max(3000, estimatedDurationSec * 1000));
            await whatsapp.sendTypingIndicator(message.messageId, "audio");
            await sleep(recordingDelay);

            try {
              const audioFile = await getObjectFromR2(audioRecord.r2Key);
              const mediaId = await whatsapp.uploadAudioMedia(
                audioFile.body,
                audioRecord.filename,
                audioFile.contentType !== "application/octet-stream"
                  ? audioFile.contentType
                  : (audioRecord.mimeType ?? "audio/ogg"),
              );
              await whatsapp.sendAudioMessageById(message.from, mediaId);
              const persistBody = `[AUDIO:${audioRecord.url}|${audioRecord.title}]`;
              await persistTurn(message.from, "assistant", persistBody, { source: "AI" });
              broadcast("message:new", {
                phone: message.from,
                role: "assistant",
                source: "AI",
                content: persistBody,
              });
              console.log(
                `[audio-reply] sent audio "${audioRecord.title}" to ${message.from}`,
              );
            } catch (audioError) {
              console.error(`[audio-reply] failed to send audio`, audioError);
              logWhatsAppPermissionHint(audioError);
              if (isWhatsAppPermissionError(audioError)) {
                throw audioError;
              }
            }
          } else {
            // Audio not found, send the full text reply without the tag
            const fallbackText = audioTag.textWithoutTag || aiReply.replace(AUDIO_TAG_REGEX, "").trim();
            await whatsapp.sendTextMessage(message.from, fallbackText);
            await persistTurn(message.from, "assistant", fallbackText, { source: "AI" });
            broadcast("message:new", {
              phone: message.from,
              role: "assistant",
              source: "AI",
              content: fallbackText,
            });
          }
        } else {
          await whatsapp.sendTextMessage(message.from, aiReply);
          await persistTurn(message.from, "assistant", aiReply, { source: "AI" });
          broadcast("message:new", {
            phone: message.from,
            role: "assistant",
            source: "AI",
            content: aiReply,
          });
        }

        // Emit WS events: AI done + updated overview
        broadcast("ai:done", { phone: message.from });

        if (prisma) {
          const overview = await dashboard.getOverview(prisma);
          broadcast("overview:updated", overview as unknown as Record<string, unknown>);
          // Fire-and-forget: auto-add FAQ if this question was asked by multiple contacts
          void tryAutoFaq(prisma, message.from, userText, aiReply);
          // Cache the reply for the FAQ feedback loop (24h) + semantic cache (12h)
          if (!isGreetingOnlyMessage(userText)) {
            void saveFaqFeedbackCache(userText, aiReply);
            void saveSemanticReplyCache(userText, aiReply);
          }
        }
      } catch (error) {
        logWhatsAppPermissionHint(error);
        console.error(
          `[message:${message.messageId}] failed processing from ${message.from}`,
          error,
        );
        broadcast("ai:done", { phone: message.from });
      }
    }
  })();

  return new Response("EVENT_RECEIVED", { status: 200 });
};

// ── Phase 2: Pipeline / Kanban endpoints ───────────────────────────

const instagramWebhookEvent = async (
  payload: InstagramWebhookPayload,
): Promise<Response> => {
  console.log(
    "[instagram-webhook] received event payload entries:",
    payload.entry?.length ?? 0,
  );

  const inbound = extractInstagramInboundMessages(payload);
  console.log("[instagram-webhook] extracted inbound messages:", inbound.length);

  void (async () => {
    for (const message of inbound) {
      if (!shouldProcessMessage(message.messageId)) {
        console.log(
          `[instagram-webhook] skipping duplicate message ${message.messageId}`,
        );
        continue;
      }

      const contactKey = buildContactKey("INSTAGRAM", message.from);
      console.log(`[instagram-webhook] processing message from ${contactKey}`);

      try {
        const prisma = await getPrismaClient();
        const connection = prisma
          ? await prisma.instagramConnection.findUnique({
              where: { pageId: message.pageId },
              select: {
                id: true,
                pageId: true,
                pageAccessToken: true,
                instagramAccountId: true,
                status: true,
              },
            })
          : null;

        if (!connection || connection.status === "DISCONNECTED") {
          console.warn(
            `[instagram-webhook] no active connection found for page ${message.pageId}`,
          );
          continue;
        }

        const deliveryTarget: MessageDeliveryTarget = {
          waId: contactKey,
          channel: "INSTAGRAM",
          externalId: message.from,
          instagramConnection: {
            pageId: connection.pageId,
            pageAccessToken: connection.pageAccessToken,
            instagramAccountId: connection.instagramAccountId,
          },
        };

        const inboundContent = await resolveInstagramInboundContent(
          message,
          prisma ?? undefined,
        );
        const rawUserText = inboundContent.userText.trim();
        const storedBody = inboundContent.storedBody.trim();

        if (!storedBody) {
          continue;
        }

        await persistTurn(contactKey, "user", storedBody, {
          externalMessageId: message.messageId,
          source: "USER",
          channel: "INSTAGRAM",
          externalId: message.from,
          externalThreadId: message.pageId,
          instagramConnectionId: connection.id,
        });

        broadcast("message:new", {
          phone: contactKey,
          role: "user",
          source: "USER",
          content: storedBody,
        });
        broadcast("ai:processing", { phone: contactKey });
        broadcast("notification", {
          phone: contactKey,
          name: null,
          messageId: message.messageId,
          preview: inboundContent.previewText.slice(0, 120),
        });

        if (!rawUserText) {
          const fallbackReply =
            inboundContent.kind === "image"
              ? buildImageFallbackReply("instagram", inboundContent.imageSummary)
              : "No momento eu consigo te atender melhor por texto. Pode me mandar sua duvida escrita?";
          await sendTextToTarget(deliveryTarget, fallbackReply);
          await persistTurn(contactKey, "assistant", fallbackReply, {
            source: "SYSTEM",
            channel: "INSTAGRAM",
            externalId: message.from,
            externalThreadId: message.pageId,
            instagramConnectionId: connection.id,
          });
          broadcast("message:new", {
            phone: contactKey,
            role: "assistant",
            source: "SYSTEM",
            content: fallbackReply,
          });
          broadcast("ai:done", { phone: contactKey });
          continue;
        }

        if (isGreetingOnlyMessage(rawUserText)) {
          const greetingReply = buildGreetingReply();
          if (prisma) {
            const latestContact = await prisma.contact.findUnique({
              where: { waId: contactKey },
              select: { botEnabled: true, name: true },
            });
            if (latestContact && !latestContact.botEnabled) {
              broadcast("ai:done", { phone: contactKey });
              continue;
            }
            if (latestContact) {
              const personalizedGreetingReply = buildGreetingReply(latestContact.name);
              if (shouldSuppressRecentAutoReply(contactKey, personalizedGreetingReply)) {
                broadcast("ai:done", { phone: contactKey });
                continue;
              }

              await sleep(computeReplyDelayMs(personalizedGreetingReply));
              await sendTextToTarget(deliveryTarget, personalizedGreetingReply);
              rememberRecentAutoReply(contactKey, personalizedGreetingReply);
              await persistTurn(contactKey, "assistant", personalizedGreetingReply, {
                source: "AI",
                channel: "INSTAGRAM",
                externalId: message.from,
                externalThreadId: message.pageId,
                instagramConnectionId: connection.id,
              });
              broadcast("message:new", {
                phone: contactKey,
                role: "assistant",
                source: "AI",
                content: personalizedGreetingReply,
              });
              broadcast("ai:done", { phone: contactKey });
              continue;
            }
          }
          if (shouldSuppressRecentAutoReply(contactKey, greetingReply)) {
            broadcast("ai:done", { phone: contactKey });
            continue;
          }

          await sleep(computeReplyDelayMs(greetingReply));
          await sendTextToTarget(deliveryTarget, greetingReply);
          rememberRecentAutoReply(contactKey, greetingReply);
          await persistTurn(contactKey, "assistant", greetingReply, {
            source: "AI",
            channel: "INSTAGRAM",
            externalId: message.from,
            externalThreadId: message.pageId,
            instagramConnectionId: connection.id,
          });
          broadcast("message:new", {
            phone: contactKey,
            role: "assistant",
            source: "AI",
            content: greetingReply,
          });
          broadcast("ai:done", { phone: contactKey });
          continue;
        }

        let aiReply: string;

        const cachedReply =
          (await tryFaqFeedbackCache(rawUserText)) ??
          (await trySemanticReplyCache(rawUserText));

        if (cachedReply && prisma) {
          const latestContact = await prisma.contact.findUnique({
            where: { waId: contactKey },
            select: { botEnabled: true },
          });
          if (latestContact && latestContact.botEnabled) {
            const typingDelay = Math.min(
              2000,
              Math.max(500, cachedReply.length * 15),
            );
            await sleep(typingDelay);
            await sendTextToTarget(deliveryTarget, cachedReply);
            await persistTurn(contactKey, "assistant", cachedReply, {
              source: "AI",
              channel: "INSTAGRAM",
              externalId: message.from,
              externalThreadId: message.pageId,
              instagramConnectionId: connection.id,
            });
            broadcast("message:new", {
              phone: contactKey,
              role: "assistant",
              source: "AI",
              content: cachedReply,
            });
            broadcast("ai:done", { phone: contactKey });
            console.log(
              `[instagram-cache-reply] served cached reply to ${contactKey}`,
            );
            continue;
          }
        }

        if (prisma) {
          let contact = await prisma.contact.findUnique({
            where: { waId: contactKey },
          });
          if (contact && !contact.botEnabled) {
            broadcast("ai:done", { phone: contactKey });
            continue;
          }
          if (!contact) {
            console.warn(
              `[instagram:${contactKey}] contact not found after inbound persist`,
            );
            broadcast("ai:done", { phone: contactKey });
            continue;
          }

          let extraction: Awaited<ReturnType<OpenAIService["extractLeadData"]>> = {};
          try {
            extraction = await openAI.extractLeadData(rawUserText, prisma);
          } catch (error) {
            console.warn(`[instagram:${contactKey}] extraction failed`, error);
          }

          const wantsHuman = await resolveHumanHandoffIntent(
            prisma,
            contact.id,
            rawUserText,
            extraction,
          );
          const updateData = buildContactUpdateFromExtraction(extraction);

          if (wantsHuman) {
            Object.assign(
              updateData,
              buildQueuedHandoffState(
                extraction.handoffReason ?? "Solicitacao de verificacao humana",
                new Date(),
              ),
            );
          }

          const mergedSnapshot: ContactTriageSnapshot = {
            name: (updateData.name as string | undefined) ?? contact?.name,
            email: (updateData.email as string | undefined) ?? contact?.email,
            tournament:
              (updateData.tournament as string | undefined) ?? contact?.tournament,
            eventDate:
              (updateData.eventDate as string | undefined) ?? contact?.eventDate,
            category: (updateData.category as string | undefined) ?? contact?.category,
            city: (updateData.city as string | undefined) ?? contact?.city,
            teamName: (updateData.teamName as string | undefined) ?? contact?.teamName,
            playersCount:
              (updateData.playersCount as number | undefined) ??
              contact?.playersCount ??
              null,
          };

          const missingFields = computeMissingLeadFields(mergedSnapshot);
          updateData.triageCompleted = missingFields.length === 0;
          updateData.channel = "INSTAGRAM";
          updateData.externalId = message.from;
          updateData.externalThreadId = message.pageId;
          updateData.instagramConnectionId = connection.id;

          if (Object.keys(updateData).length > 0) {
            contact = await prisma.contact.update({
              where: { waId: contactKey },
              data: updateData,
            });

            broadcast("contact:updated", {
              waId: contactKey,
              contact: contact as unknown as Record<string, unknown>,
            });
            void emitAlertsSummary(prisma);

            if (wantsHuman) {
              void openAI.refreshConversationSummary(prisma, contact.id, contactKey);
            }

            if (updateData.triageCompleted === true && !wantsHuman) {
              void tryAutoQualify(
                prisma,
                contact.id,
                contact.triageCompleted,
                contact.stageId,
              );
            }

            void tryAutoTag(prisma, contact.id, {
              ...mergedSnapshot,
              age: contact.age,
              level: contact.level,
            });
            void tryAdvancedAutoTag(prisma, contact.id, rawUserText);
            void updateLeadScore(prisma, contact.id);
          }

          if (wantsHuman) {
            const handoffReply = buildHandoffAcknowledgement();
            await sleep(computeReplyDelayMs(handoffReply));
            await sendTextToTarget(deliveryTarget, handoffReply);
            await persistTurn(contactKey, "assistant", handoffReply, {
              source: "SYSTEM",
              channel: "INSTAGRAM",
              externalId: message.from,
              externalThreadId: message.pageId,
              instagramConnectionId: connection.id,
            });
            broadcast("message:new", {
              phone: contactKey,
              role: "assistant",
              source: "SYSTEM",
              content: handoffReply,
            });
            broadcast("ai:done", { phone: contactKey });
            continue;
          }

          aiReply = await openAI.generateReply(rawUserText, prisma, contactKey, {
            triageMissing: missingFields,
          });

          if (contact) {
            void tryAutoTask(prisma, contact.id, rawUserText);
          }
        } else {
          aiReply = await openAI.generateReply(rawUserText);
        }

        const typingDelay = Math.min(3000, Math.max(800, aiReply.length * 12));
        await sleep(typingDelay);

        if (prisma) {
          const latestContact = await prisma.contact.findUnique({
            where: { waId: contactKey },
            select: { botEnabled: true },
          });
          if (latestContact && !latestContact.botEnabled) {
            broadcast("ai:done", { phone: contactKey });
            continue;
          }
        }

        const audioTag = parseAudioTag(aiReply);
        const finalReply =
          audioTag?.textWithoutTag ||
          aiReply.replace(AUDIO_TAG_REGEX, "").trim() ||
          aiReply;

        await sendTextToTarget(deliveryTarget, finalReply);
        await persistTurn(contactKey, "assistant", finalReply, {
          source: "AI",
          channel: "INSTAGRAM",
          externalId: message.from,
          externalThreadId: message.pageId,
          instagramConnectionId: connection.id,
        });
        broadcast("message:new", {
          phone: contactKey,
          role: "assistant",
          source: "AI",
          content: finalReply,
        });

        broadcast("ai:done", { phone: contactKey });

        if (prisma) {
          const overview = await dashboard.getOverview(prisma);
          broadcast("overview:updated", overview as unknown as Record<string, unknown>);
          void tryAutoFaq(prisma, contactKey, rawUserText, finalReply);
          if (!isGreetingOnlyMessage(rawUserText)) {
            void saveFaqFeedbackCache(rawUserText, finalReply);
            void saveSemanticReplyCache(rawUserText, finalReply);
          }
        }
      } catch (error) {
        console.error(
          `[instagram:${message.messageId}] failed processing from ${contactKey}`,
          error,
        );
        broadcast("ai:done", { phone: contactKey });
      }
    }
  })();

  return new Response("EVENT_RECEIVED", { status: 200 });
};

const webhookEvent = async (
  req: Request,
  routeChannel: WebhookRouteChannel,
): Promise<Response> => {
  const rawBody = await req.text();

  let payload: unknown;
  try {
    payload = rawBody ? (JSON.parse(rawBody) as unknown) : {};
  } catch {
    return json({ error: "Invalid JSON payload" }, 400, req);
  }

  const payloadChannel = resolveWebhookPayloadChannel(payload);
  if (!payloadChannel) {
    return json({ error: "Unsupported webhook payload" }, 400, req);
  }

  if (routeChannel !== "generic" && payloadChannel !== routeChannel) {
    return json({ error: "Webhook payload routed to the wrong channel endpoint" }, 400, req);
  }

  const isSignatureValid = await verifyMetaWebhookSignature(
    req.headers.get("x-hub-signature-256"),
    rawBody,
    resolveWebhookAppSecret(payloadChannel),
  );
  if (!isSignatureValid) {
    return json({ error: "Invalid webhook signature" }, 403, req);
  }

  if (payloadChannel === "whatsapp") {
    return whatsappWebhookEvent(payload as WhatsAppWebhookPayload);
  }

  if (payloadChannel === "instagram") {
    return instagramWebhookEvent(payload as InstagramWebhookPayload);
  }

  return json({ error: "Unsupported webhook payload" }, 400, req);
};

const handlePipelineStages = async (req: Request): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.PIPELINE_VIEW);
  if (denied) return denied;

  const url = new URL(req.url);
  const search = url.searchParams.get("search")?.trim();
  const includeInactive =
    url.searchParams.get("includeInactive") === "1" ||
    url.searchParams.get("includeInactive") === "true";

  const where: Prisma.PipelineStageWhereInput = {};
  if (search) {
    where.name = { contains: search, mode: "insensitive" };
  }
  if (!includeInactive) {
    where.isActive = true;
  }

  const stages = await current.prisma.pipelineStage.findMany({
    where,
    orderBy: { position: "asc" },
  });
  return json(stages, 200, req);
};

const handlePipelineStageCreate = async (req: Request): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.PIPELINE_MANAGE);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, req);
  }

  const input = body as Record<string, unknown>;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const color = typeof input.color === "string" ? input.color.trim() : "#06b6d4";
  const isActive = typeof input.isActive === "boolean" ? input.isActive : true;

  if (!name) {
    return json({ error: "name is required" }, 400, req);
  }

  const maxPosition = await current.prisma.pipelineStage.aggregate({
    _max: { position: true },
  });
  const position = (maxPosition._max.position ?? 0) + 1;

  try {
    const stage = await current.prisma.pipelineStage.create({
      data: { name, color, isActive, position },
    });
    broadcast("pipeline:updated", { action: "stage:created", stageId: stage.id });
    void invalidateDashboardCaches();
    return json(stage, 201, req);
  } catch {
    return json({ error: "Could not create pipeline stage" }, 400, req);
  }
};

const handlePipelineStageUpdate = async (
  req: Request,
  id: number,
): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.PIPELINE_MANAGE);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, req);
  }

  const input = body as Record<string, unknown>;
  const data: Record<string, unknown> = {};

  if (typeof input.name === "string") {
    const name = input.name.trim();
    if (!name) return json({ error: "name cannot be empty" }, 400, req);
    data.name = name;
  }
  if (typeof input.color === "string") {
    const color = input.color.trim();
    if (color) data.color = color;
  }
  if (typeof input.isActive === "boolean") {
    data.isActive = input.isActive;
  }

  if (!Object.keys(data).length) {
    return json({ error: "No valid fields provided" }, 400, req);
  }

  try {
    const stage = await current.prisma.pipelineStage.update({
      where: { id },
      data,
    });
    broadcast("pipeline:updated", { action: "stage:updated", stageId: stage.id });
    void invalidateDashboardCaches();
    return json(stage, 200, req);
  } catch {
    return json({ error: "Could not update pipeline stage" }, 400, req);
  }
};

const handlePipelineStageDelete = async (
  req: Request,
  id: number,
): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.PIPELINE_MANAGE);
  if (denied) return denied;

  try {
    await current.prisma.pipelineStage.delete({ where: { id } });
    broadcast("pipeline:updated", { action: "stage:deleted", stageId: id });
    void invalidateDashboardCaches();
    return json({ ok: true }, 200, req);
  } catch {
    return json({ error: "Could not delete pipeline stage" }, 400, req);
  }
};

const handlePipelineStagesReorder = async (req: Request): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.PIPELINE_MANAGE);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, req);
  }

  const input = body as Record<string, unknown>;
  const raw = Array.isArray(input.stageIds) ? input.stageIds : [];
  const stageIds = raw
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);

  if (!stageIds.length) {
    return json({ error: "stageIds is required" }, 400, req);
  }

  const uniqueStageIds = Array.from(new Set(stageIds));
  const existing = await current.prisma.pipelineStage.findMany({
    select: { id: true },
  });
  if (existing.length !== uniqueStageIds.length) {
    return json({ error: "stageIds must contain every pipeline stage exactly once" }, 400, req);
  }
  const existingIds = new Set(existing.map((stage) => stage.id));
  if (uniqueStageIds.some((id) => !existingIds.has(id))) {
    return json({ error: "stageIds has invalid values" }, 400, req);
  }

  await current.prisma.$transaction(async (tx) => {
    // First set all positions to negative offsets to avoid unique constraint collisions
    await Promise.all(
      uniqueStageIds.map((id, index) =>
        tx.pipelineStage.update({
          where: { id },
          data: { position: -(index + 1) },
        }),
      ),
    );
    // Then set final positions
    await Promise.all(
      uniqueStageIds.map((id, index) =>
        tx.pipelineStage.update({
          where: { id },
          data: { position: index + 1 },
        }),
      ),
    );
  });

  broadcast("pipeline:updated", { action: "stage:reordered" });
  void invalidateDashboardCaches();
  return json({ ok: true }, 200, req);
};

const handlePipelineBoard = async (req: Request): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.PIPELINE_VIEW);
  if (denied) return denied;

  const url = new URL(req.url);
  const limit = parseBoundedInteger(
    url.searchParams.get("limit") ?? url.searchParams.get("contactLimit"),
    PIPELINE_PAGE_SIZE_DEFAULT,
    PIPELINE_PAGE_SIZE_MIN,
    PIPELINE_PAGE_SIZE_MAX,
  );
  const filters = parsePipelineFilters(url);

  const cacheKey = buildPipelineCacheKey("board", url);
  const cached = await cacheGetJson<{ stages: unknown[]; unassigned: unknown }>(cacheKey);
  if (cached) {
    return json(cached, 200, req);
  }

  const stages = await current.prisma.pipelineStage.findMany({
    orderBy: { position: "asc" },
  });
  const [unassigned, stagePages] = await Promise.all([
    loadPipelineColumnPage(current.prisma, null, filters, limit, 0),
    Promise.all(
      stages.map((stage) =>
        loadPipelineColumnPage(current.prisma, stage.id, filters, limit, 0),
      ),
    ),
  ]);

  const payload = {
    stages: stages.map((stage, index) => ({
      ...stage,
      ...stagePages[index],
    })),
    unassigned,
  };
  void cacheSetJson(cacheKey, payload, PIPELINE_CACHE_TTL_SECONDS);
  return json(payload, 200, req);
};

const handlePipelineBoardColumn = async (req: Request): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.PIPELINE_VIEW);
  if (denied) return denied;

  const url = new URL(req.url);
  const stageId = parsePipelineStageId(url.searchParams.get("stageId"));
  if (stageId === "invalid") {
    return json({ error: "stageId invalido" }, 400, req);
  }

  if (typeof stageId === "number") {
    const stageExists = await current.prisma.pipelineStage.findUnique({
      where: { id: stageId },
      select: { id: true },
    });
    if (!stageExists) {
      return json({ error: "Etapa nao encontrada" }, 404, req);
    }
  }

  const limit = parseBoundedInteger(
    url.searchParams.get("limit"),
    PIPELINE_PAGE_SIZE_DEFAULT,
    PIPELINE_PAGE_SIZE_MIN,
    PIPELINE_PAGE_SIZE_MAX,
  );
  const offset = parseBoundedInteger(
    url.searchParams.get("offset"),
    0,
    0,
    Number.MAX_SAFE_INTEGER,
  );
  const filters = parsePipelineFilters(url);

  const cacheKey = buildPipelineCacheKey("column", url);
  const cached = await cacheGetJson<{ items: unknown[]; total: number; limit: number; offset: number }>(cacheKey);
  if (cached) {
    return json(cached, 200, req);
  }

  const payload = await loadPipelineColumnPage(
    current.prisma,
    stageId,
    filters,
    limit,
    offset,
  );
  void cacheSetJson(cacheKey, payload, PIPELINE_CACHE_TTL_SECONDS);
  return json(payload, 200, req);
};

const handleContactCreate = async (req: Request): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.CONTACTS_CREATE);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, req);
  }

  const input =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};

  const rawWaId = typeof input.waId === "string" ? input.waId.trim() : "";
  if (!rawWaId) {
    return json({ error: "waId is required" }, 400, req);
  }

  let channel: ContactChannelValue = "WHATSAPP";
  if (hasOwn(input, "channel")) {
    const rawChannel =
      typeof input.channel === "string" ? input.channel.trim().toUpperCase() : "";
    if (rawChannel !== "WHATSAPP" && rawChannel !== "INSTAGRAM") {
      return json({ error: "channel must be WHATSAPP or INSTAGRAM" }, 400, req);
    }
    channel = rawChannel as ContactChannelValue;
  } else {
    channel = inferContactChannel(undefined, rawWaId);
  }

  let externalId = normalizeNullableText(input.externalId);
  if (externalId === undefined) {
    externalId = resolveContactExternalId(rawWaId, channel);
  }

  let instagramConnectionId: string | null | undefined;
  if (hasOwn(input, "instagramConnectionId")) {
    const value = normalizeNullableText(input.instagramConnectionId);
    if (value === undefined) {
      return json(
        { error: "instagramConnectionId must be a string or null" },
        400,
        req,
      );
    }
    instagramConnectionId = value;
  }

  if (instagramConnectionId) {
    const connection = await current.prisma.instagramConnection.findUnique({
      where: { id: instagramConnectionId },
      select: { id: true },
    });
    if (!connection) {
      return json({ error: "Instagram connection not found" }, 404, req);
    }
  }

  const waId =
    channel === "INSTAGRAM"
      ? buildContactKey("INSTAGRAM", externalId ?? rawWaId)
      : rawWaId;

  const data: Prisma.ContactUncheckedCreateInput = {
    waId,
    channel,
    externalId: externalId ?? resolveContactExternalId(waId, channel),
    leadStatus: "open",
    triageCompleted: false,
    ...buildNoHandoffState(),
  };

  if (instagramConnectionId !== undefined) {
    data.instagramConnectionId = instagramConnectionId;
  }
  if (hasOwn(input, "externalThreadId")) {
    const value = normalizeNullableText(input.externalThreadId);
    if (value === undefined) {
      return json({ error: "externalThreadId must be a string or null" }, 400, req);
    }
    data.externalThreadId = value;
  }
  if (hasOwn(input, "platformHandle")) {
    const value = normalizeNullableText(input.platformHandle);
    if (value === undefined) {
      return json({ error: "platformHandle must be a string or null" }, 400, req);
    }
    data.platformHandle = value;
  }

  if (hasOwn(input, "name")) {
    const value = normalizeNullableText(input.name);
    if (value === undefined) return json({ error: "name must be a string or null" }, 400, req);
    data.name = value;
  }
  if (hasOwn(input, "email")) {
    const value = normalizeNullableText(input.email);
    if (value === undefined) return json({ error: "email must be a string or null" }, 400, req);
    data.email = value;
  }
  if (hasOwn(input, "tournament")) {
    const value = normalizeNullableText(input.tournament);
    if (value === undefined) {
      return json({ error: "tournament must be a string or null" }, 400, req);
    }
    data.tournament = value;
  }
  if (hasOwn(input, "eventDate")) {
    const value = normalizeNullableText(input.eventDate);
    if (value === undefined) {
      return json({ error: "eventDate must be a string or null" }, 400, req);
    }
    data.eventDate = value;
  }
  if (hasOwn(input, "category")) {
    const value = normalizeNullableText(input.category);
    if (value === undefined) {
      return json({ error: "category must be a string or null" }, 400, req);
    }
    data.category = value;
  }
  if (hasOwn(input, "city")) {
    const value = normalizeNullableText(input.city);
    if (value === undefined) return json({ error: "city must be a string or null" }, 400, req);
    data.city = value;
  }
  if (hasOwn(input, "teamName")) {
    const value = normalizeNullableText(input.teamName);
    if (value === undefined) {
      return json({ error: "teamName must be a string or null" }, 400, req);
    }
    data.teamName = value;
  }
  if (hasOwn(input, "playersCount")) {
    const value = normalizePositiveInt(input.playersCount);
    if (value === undefined) {
      return json({ error: "playersCount must be numeric or null" }, 400, req);
    }
    data.playersCount = value;
  }
  if (hasOwn(input, "source")) {
    const value = normalizeNullableText(input.source);
    if (value === undefined) return json({ error: "source must be a string or null" }, 400, req);
    data.source = value;
  }
  if (hasOwn(input, "notes")) {
    const value = normalizeNullableText(input.notes);
    if (value === undefined) return json({ error: "notes must be a string or null" }, 400, req);
    data.notes = value;
  }
  if (hasOwn(input, "age")) {
    const value = normalizeNullableText(input.age);
    if (value === undefined) return json({ error: "age must be a string or null" }, 400, req);
    data.age = value;
  }
  if (hasOwn(input, "level")) {
    const value = normalizeNullableText(input.level);
    if (value === undefined) return json({ error: "level must be a string or null" }, 400, req);
    data.level = value;
  }
  if (hasOwn(input, "objective")) {
    const value = normalizeNullableText(input.objective);
    if (value === undefined) {
      return json({ error: "objective must be a string or null" }, 400, req);
    }
    data.objective = value;
  }

  if (hasOwn(input, "stageId")) {
    const stageId = input.stageId === null ? null : Number(input.stageId);
    if (stageId !== null && !Number.isInteger(stageId)) {
      return json({ error: "stageId must be an integer or null" }, 400, req);
    }
    if (stageId !== null) {
      const stage = await current.prisma.pipelineStage.findUnique({
        where: { id: stageId },
        select: { id: true },
      });
      if (!stage) {
        return json({ error: "Pipeline stage not found" }, 404, req);
      }
    }
    data.stageId = stageId;
  }

  if (hasOwn(input, "leadStatus")) {
    const leadStatus =
      typeof input.leadStatus === "string" ? input.leadStatus.trim().toLowerCase() : "";
    if (!VALID_LEAD_STATUS.has(leadStatus)) {
      return json({ error: "leadStatus must be one of: open, won, lost" }, 400, req);
    }
    data.leadStatus = leadStatus;
  }

  let triageCompleted: boolean | undefined;
  if (hasOwn(input, "triageCompleted")) {
    if (typeof input.triageCompleted !== "boolean") {
      return json({ error: "triageCompleted must be a boolean" }, 400, req);
    }
    triageCompleted = input.triageCompleted;
  }

  let handoffRequested: boolean | undefined;
  if (hasOwn(input, "handoffRequested")) {
    if (typeof input.handoffRequested !== "boolean") {
      return json({ error: "handoffRequested must be a boolean" }, 400, req);
    }
    handoffRequested = input.handoffRequested;
  }

  let handoffReason: string | null | undefined;
  if (hasOwn(input, "handoffReason")) {
    const value = normalizeNullableText(input.handoffReason);
    if (value === undefined) {
      return json({ error: "handoffReason must be a string or null" }, 400, req);
    }
    handoffReason = value;
  }

  let handoffAt: Date | null | undefined;
  if (hasOwn(input, "handoffAt")) {
    const parsed = parseDateInput(input.handoffAt);
    if (parsed === undefined) {
      return json({ error: "handoffAt must be a valid date string or null" }, 400, req);
    }
    handoffAt = parsed;
  }

  let botEnabled = true;
  if (hasOwn(input, "botEnabled")) {
    if (typeof input.botEnabled !== "boolean") {
      return json({ error: "botEnabled must be a boolean" }, 400, req);
    }
    botEnabled = input.botEnabled;
  }
  data.botEnabled = botEnabled;

  const computedTriageSnapshot: ContactTriageSnapshot = {
    name: data.name ?? null,
    email: data.email ?? null,
    tournament: data.tournament ?? null,
    eventDate: data.eventDate ?? null,
    category: data.category ?? null,
    city: data.city ?? null,
    teamName: data.teamName ?? null,
    playersCount: typeof data.playersCount === "number" ? data.playersCount : null,
  };
  data.triageCompleted =
    triageCompleted ?? computeMissingLeadFields(computedTriageSnapshot).length === 0;

  const finalHandoffRequested = !botEnabled ? true : (handoffRequested ?? false);
  if (finalHandoffRequested) {
    Object.assign(
      data,
      buildQueuedHandoffState(
        handoffReason ??
          (!botEnabled
            ? "Bot desativado manualmente no cadastro"
            : "Solicitacao manual de atendimento humano"),
        handoffAt ?? new Date(),
      ),
    );
  } else {
    Object.assign(data, buildNoHandoffState());
    data.botEnabled = true;
  }

  let contact;
  try {
    contact = await current.prisma.contact.create({
      data,
      include: {
        tags: { include: { tag: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { body: true, createdAt: true },
        },
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes("unique")) {
      return json({ error: "Contact with this waId already exists" }, 409, req);
    }
    console.error("Failed to create contact", error);
    return json({ error: "Failed to create contact" }, 500, req);
  }

  broadcast("contact:updated", {
    waId: contact.waId,
    action: "contact:created",
    contact: contact as unknown as Record<string, unknown>,
  });
  void invalidateDashboardCaches();
  void emitAlertsSummary(current.prisma);
  return json(contact, 201, req);
};

const handleContactStageUpdate = async (
  req: Request,
  waId: string,
): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.LEADS_MANAGE_STAGE);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, req);
  }

  const input = body as Record<string, unknown>;
  const stageId = input.stageId === null ? null : Number(input.stageId);
  if (stageId !== null && !Number.isInteger(stageId)) {
    return json({ error: "stageId must be an integer or null" }, 400, req);
  }

  if (stageId !== null) {
    const stage = await current.prisma.pipelineStage.findUnique({
      where: { id: stageId },
      select: { id: true },
    });
    if (!stage) {
      return json({ error: "Pipeline stage not found" }, 404, req);
    }
  }

  let contact;
  try {
    contact = await current.prisma.contact.update({
      where: { waId },
      data: { stageId },
      include: { tags: { include: { tag: true } } },
    });
  } catch {
    return json({ error: "Contact not found" }, 404, req);
  }

  broadcast("contact:updated", { waId, stageId, contact: contact as unknown as Record<string, unknown> });
  void invalidateDashboardCaches();
  return json(contact, 200, req);
};

// ── Audit logging helper ─────────────────────────────────────
const logContactChanges = async (
  prisma: PrismaClient,
  contactId: number,
  userId: string | null,
  action: string,
  oldData: Record<string, unknown>,
  newData: Record<string, unknown>,
) => {
  const entries: Array<{
    contactId: number;
    userId: string | null;
    action: string;
    field: string;
    oldValue: string | null;
    newValue: string | null;
  }> = [];

  for (const key of Object.keys(newData)) {
    const oldVal = oldData[key];
    const newVal = newData[key];
    if (String(oldVal ?? "") !== String(newVal ?? "")) {
      entries.push({
        contactId,
        userId,
        action,
        field: key,
        oldValue: oldVal != null ? String(oldVal) : null,
        newValue: newVal != null ? String(newVal) : null,
      });
    }
  }

  if (entries.length > 0) {
    if (!contactAuditLogAvailable) return;

    try {
      await (prisma as any).contactAuditLog.createMany({ data: entries });
    } catch (error) {
      if (isPrismaMissingTableError(error, "public.ContactAuditLog")) {
        disableContactAuditLog("missing table public.ContactAuditLog");
        return;
      }
      throw error;
    }
  }
};

const handleContactUpdate = async (
  req: Request,
  waId: string,
): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, req);
  }

  const input =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};
  const canEditContacts = hasPermission(current.user.permissions, PERMISSIONS.CONTACTS_EDIT);
  if (!canEditContacts) {
    return json({ error: "Forbidden: missing permission contacts.edit" }, 403, req);
  }
  if (
    hasOwn(input, "leadStatus") &&
    !hasPermission(current.user.permissions, PERMISSIONS.LEADS_MANAGE_STATUS)
  ) {
    return json({ error: "Forbidden: missing permission leads.manage_status" }, 403, req);
  }
  if (
    hasOwn(input, "stageId") &&
    !hasPermission(current.user.permissions, PERMISSIONS.LEADS_MANAGE_STAGE)
  ) {
    return json({ error: "Forbidden: missing permission leads.manage_stage" }, 403, req);
  }
  if (
    hasOwn(input, "botEnabled") &&
    !hasPermission(current.user.permissions, PERMISSIONS.CONTACTS_MANAGE_BOT)
  ) {
    return json({ error: "Forbidden: missing permission contacts.manage_bot" }, 403, req);
  }
  if (
    (hasOwn(input, "handoffRequested") ||
      hasOwn(input, "handoffReason") ||
      hasOwn(input, "handoffAt")) &&
    !hasPermission(current.user.permissions, PERMISSIONS.CONTACTS_MANAGE_HANDOFF)
  ) {
    return json({ error: "Forbidden: missing permission contacts.manage_handoff" }, 403, req);
  }

  const existing = await current.prisma.contact.findUnique({
    where: { waId },
    select: {
      id: true,
      channel: true,
      externalId: true,
      externalThreadId: true,
      platformHandle: true,
      instagramConnectionId: true,
      name: true,
      email: true,
      tournament: true,
      eventDate: true,
      category: true,
      city: true,
      teamName: true,
      playersCount: true,
      leadStatus: true,
      stageId: true,
      botEnabled: true,
      handoffRequested: true,
      handoffStatus: true,
      handoffReason: true,
      handoffAt: true,
      handoffAssignedAt: true,
      handoffAssignedToUserId: true,
      handoffFirstHumanReplyAt: true,
      triageCompleted: true,
      source: true,
      notes: true,
    },
  });
  if (!existing) {
    return json({ error: "Contact not found" }, 404, req);
  }

  const data: Prisma.ContactUncheckedUpdateInput = {};
  const triageUpdate: ContactTriageSnapshot = {};

  if (hasOwn(input, "name")) {
    const value = normalizeNullableText(input.name);
    if (value !== undefined) {
      data.name = value;
      triageUpdate.name = value;
    }
  }
  if (hasOwn(input, "email")) {
    const value = normalizeNullableText(input.email);
    if (value !== undefined) {
      data.email = value;
      triageUpdate.email = value;
    }
  }
  if (hasOwn(input, "tournament")) {
    const value = normalizeNullableText(input.tournament);
    if (value !== undefined) {
      data.tournament = value;
      triageUpdate.tournament = value;
    }
  }
  if (hasOwn(input, "eventDate")) {
    const value = normalizeNullableText(input.eventDate);
    if (value !== undefined) {
      data.eventDate = value;
      triageUpdate.eventDate = value;
    }
  }
  if (hasOwn(input, "category")) {
    const value = normalizeNullableText(input.category);
    if (value !== undefined) {
      data.category = value;
      triageUpdate.category = value;
    }
  }
  if (hasOwn(input, "city")) {
    const value = normalizeNullableText(input.city);
    if (value !== undefined) {
      data.city = value;
      triageUpdate.city = value;
    }
  }
  if (hasOwn(input, "teamName")) {
    const value = normalizeNullableText(input.teamName);
    if (value !== undefined) {
      data.teamName = value;
      triageUpdate.teamName = value;
    }
  }
  if (hasOwn(input, "playersCount")) {
    const value = normalizePositiveInt(input.playersCount);
    if (value !== undefined) {
      data.playersCount = value;
      triageUpdate.playersCount = value;
    }
  }

  if (hasOwn(input, "source")) {
    const value = normalizeNullableText(input.source);
    if (value !== undefined) data.source = value;
  }
  if (hasOwn(input, "channel")) {
    const rawChannel =
      typeof input.channel === "string" ? input.channel.trim().toUpperCase() : "";
    if (rawChannel !== "WHATSAPP" && rawChannel !== "INSTAGRAM") {
      return json({ error: "channel must be WHATSAPP or INSTAGRAM" }, 400, req);
    }
    data.channel = rawChannel as ContactChannelValue;
  }
  if (hasOwn(input, "externalId")) {
    const value = normalizeNullableText(input.externalId);
    if (value === undefined) {
      return json({ error: "externalId must be a string or null" }, 400, req);
    }
    data.externalId = value;
  }
  if (hasOwn(input, "externalThreadId")) {
    const value = normalizeNullableText(input.externalThreadId);
    if (value === undefined) {
      return json({ error: "externalThreadId must be a string or null" }, 400, req);
    }
    data.externalThreadId = value;
  }
  if (hasOwn(input, "platformHandle")) {
    const value = normalizeNullableText(input.platformHandle);
    if (value === undefined) {
      return json({ error: "platformHandle must be a string or null" }, 400, req);
    }
    data.platformHandle = value;
  }
  if (hasOwn(input, "instagramConnectionId")) {
    const value = normalizeNullableText(input.instagramConnectionId);
    if (value === undefined) {
      return json(
        { error: "instagramConnectionId must be a string or null" },
        400,
        req,
      );
    }
    if (value) {
      const connection = await current.prisma.instagramConnection.findUnique({
        where: { id: value },
        select: { id: true },
      });
      if (!connection) {
        return json({ error: "Instagram connection not found" }, 404, req);
      }
    }
    data.instagramConnectionId = value;
  }
  if (hasOwn(input, "notes")) {
    const value = normalizeNullableText(input.notes);
    if (value !== undefined) data.notes = value;
  }
  if (hasOwn(input, "age")) {
    const value = normalizeNullableText(input.age);
    if (value !== undefined) data.age = value;
  }
  if (hasOwn(input, "level")) {
    const value = normalizeNullableText(input.level);
    if (value !== undefined) data.level = value;
  }
  if (hasOwn(input, "objective")) {
    const value = normalizeNullableText(input.objective);
    if (value !== undefined) data.objective = value;
  }

  if (typeof input.triageCompleted === "boolean") {
    data.triageCompleted = input.triageCompleted;
  } else if (Object.keys(triageUpdate).length > 0) {
    const snapshot: ContactTriageSnapshot = {
      name: triageUpdate.name ?? existing.name,
      email: triageUpdate.email ?? existing.email,
      tournament: triageUpdate.tournament ?? existing.tournament,
      eventDate: triageUpdate.eventDate ?? existing.eventDate,
      category: triageUpdate.category ?? existing.category,
      city: triageUpdate.city ?? existing.city,
      teamName: triageUpdate.teamName ?? existing.teamName,
      playersCount: triageUpdate.playersCount ?? existing.playersCount,
    };
    data.triageCompleted = computeMissingLeadFields(snapshot).length === 0;
  }

  const requestedHandoff =
    typeof input.handoffRequested === "boolean" ? input.handoffRequested : undefined;
  let handoffReason: string | null | undefined;
  if (hasOwn(input, "handoffReason")) {
    const value = normalizeNullableText(input.handoffReason);
    if (value !== undefined) {
      handoffReason = value;
      data.handoffReason = value;
    }
  }
  let handoffAt: Date | null | undefined;
  if (hasOwn(input, "handoffAt")) {
    const parsed = parseDateInput(input.handoffAt);
    if (parsed === undefined) {
      return json({ error: "handoffAt must be a valid date string or null" }, 400, req);
    }
    handoffAt = parsed;
    data.handoffAt = parsed;
  }

  const requestedBotEnabled =
    typeof input.botEnabled === "boolean" ? input.botEnabled : undefined;
  if (requestedBotEnabled !== undefined) {
    data.botEnabled = requestedBotEnabled;
  }

  if (hasOwn(input, "leadStatus")) {
    const leadStatus =
      typeof input.leadStatus === "string" ? input.leadStatus.trim().toLowerCase() : "";
    if (!VALID_LEAD_STATUS.has(leadStatus)) {
      return json({ error: "leadStatus must be one of: open, won, lost" }, 400, req);
    }
    data.leadStatus = leadStatus;
  }

  if (hasOwn(input, "stageId")) {
    const stageId = input.stageId === null ? null : Number(input.stageId);
    if (stageId !== null && !Number.isFinite(stageId)) {
      return json({ error: "stageId must be a number or null" }, 400, req);
    }
    data.stageId = stageId;
  }

  const currentHandoffStatus = deriveHandoffStatus(existing);
  const currentlyActiveHandoff =
    currentHandoffStatus !== "NONE" && currentHandoffStatus !== "RESOLVED";
  const desiredBotEnabled = requestedBotEnabled ?? existing.botEnabled;
  const desiredHandoffRequested = requestedHandoff ?? existing.handoffRequested;
  const shouldHaveActiveHandoff = !desiredBotEnabled || desiredHandoffRequested;

  if (shouldHaveActiveHandoff) {
    if (!currentlyActiveHandoff) {
      Object.assign(
        data,
        buildQueuedHandoffState(
          handoffReason ??
            existing.handoffReason ??
            (desiredBotEnabled === false
              ? "Bot desativado manualmente no painel"
              : "Solicitacao manual de atendimento humano"),
          handoffAt ?? existing.handoffAt ?? new Date(),
        ),
      );
    } else {
      data.botEnabled = false;
      data.handoffRequested = true;
      data.handoffStatus = currentHandoffStatus;
    }
  } else if (currentlyActiveHandoff) {
    Object.assign(data, buildResolvedHandoffState(current.user.id));
  }

  if (!Object.keys(data).length) {
    return json({ error: "No valid fields provided" }, 400, req);
  }

  const contact = await current.prisma.contact.update({
    where: { waId },
    data,
    include: {
      tags: { include: { tag: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, createdAt: true },
      },
    },
  });

  // Audit log
  void logContactChanges(
    current.prisma as any,
    existing.id,
    current.user.id,
    "update",
    existing as unknown as Record<string, unknown>,
    data as unknown as Record<string, unknown>,
  );

  broadcast("contact:updated", {
    waId,
    action: "contact:updated",
    contact: contact as unknown as Record<string, unknown>,
  });
  void invalidateDashboardCaches();
  void emitAlertsSummary(current.prisma);

  const shouldReplyAfterResume =
    contact.botEnabled &&
    !contact.handoffRequested &&
    (!existing.botEnabled || currentlyActiveHandoff);
  if (shouldReplyAfterResume) {
    void replyPendingContactAfterBotResume(current.prisma, waId);
  }

  // Auto-summary when stage changes
  if (hasOwn(input, "stageId") && existing.stageId !== (data.stageId ?? null)) {
    void tryAutoSummaryOnStageChange(
      current.prisma,
      existing.id,
      waId,
      existing.stageId,
      (data.stageId ?? null) as number | null,
    );
  }

  return json(contact, 200, req);
};

const handleContactStatusUpdate = async (
  req: Request,
  waId: string,
): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.LEADS_MANAGE_STATUS);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, req);
  }

  const input = body as Record<string, unknown>;
  const leadStatus = typeof input.leadStatus === "string" ? input.leadStatus.trim().toLowerCase() : "";
  if (!["open", "won", "lost"].includes(leadStatus)) {
    return json({ error: "leadStatus must be one of: open, won, lost" }, 400, req);
  }

  let contact;
  try {
    contact = await current.prisma.contact.update({
      where: { waId },
      data: { leadStatus },
    });
  } catch {
    return json({ error: "Contact not found" }, 404, req);
  }

  broadcast("contact:updated", { waId, leadStatus, contact: contact as unknown as Record<string, unknown> });
  void invalidateDashboardCaches();
  return json(contact, 200, req);
};

const handleContactDelete = async (
  req: Request,
  waId: string,
): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.LEADS_DELETE);
  if (denied) return denied;

  let imageKeys: string[] = [];
  try {
    await current.prisma.$transaction(async (tx) => {
      const contact = await tx.contact.findUnique({
        where: { waId },
        select: {
          id: true,
          messages: {
            select: { body: true },
          },
        },
      });

      if (!contact) {
        throw new Error("CONTACT_NOT_FOUND");
      }

      imageKeys = Array.from(
        new Set(
          contact.messages
            .flatMap((message) => extractImageMessageUrls(message.body))
            .map((url) => resolveR2KeyFromPublicUrl(url))
            .filter((key): key is string => Boolean(key)),
        ),
      );

      await tx.contact.delete({ where: { waId } });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "CONTACT_NOT_FOUND") {
      return json({ error: "Contact not found" }, 404, req);
    }
    console.error("[contact-delete] failed to delete contact", { waId, error });
    return json({ error: "Erro ao excluir contato" }, 500, req);
  }

  if (imageKeys.length) {
    const cleanupResults = await Promise.allSettled(
      imageKeys.map((key) => deleteFromR2(key)),
    );
    const failedKeys = cleanupResults.flatMap((result, index) =>
      result.status === "rejected" ? [imageKeys[index]] : [],
    );

    if (failedKeys.length) {
      console.warn("[contact-delete] failed to remove message media from R2", {
        waId,
        failedKeys,
      });
    }
  }
  broadcast("contact:deleted", { waId });
  void invalidateDashboardCaches();
  return json({ ok: true }, 200, req);
};

const handleRoleList = async (req: Request): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.USERS_MANAGE);
  if (denied) return denied;

  const roles = await current.prisma.customRole.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { users: true } } },
  });

  return json({ items: roles.map(serializeCustomRole) }, 200, req);
};

const handleRoleCreate = async (req: Request): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.USERS_MANAGE);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, req);
  }

  const input = body as Record<string, unknown>;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";
  const permissions = normalizePermissionList(input.permissions);

  if (name.length < 2) {
    return json({ error: "Nome do cargo deve ter ao menos 2 caracteres" }, 400, req);
  }
  if (!permissions.length) {
    return json({ error: "Selecione ao menos uma permissao" }, 400, req);
  }

  try {
    const role = await current.prisma.customRole.create({
      data: {
        name,
        description: description || null,
        permissions,
      },
      include: { _count: { select: { users: true } } },
    });
    return json(serializeCustomRole(role), 201, req);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return json({ error: "Ja existe um cargo com esse nome" }, 409, req);
    }
    throw error;
  }
};

const handleRoleUpdate = async (req: Request, roleId: string): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.USERS_MANAGE);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, req);
  }

  const input = body as Record<string, unknown>;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";
  const permissions = normalizePermissionList(input.permissions);

  if (name.length < 2) {
    return json({ error: "Nome do cargo deve ter ao menos 2 caracteres" }, 400, req);
  }
  if (!permissions.length) {
    return json({ error: "Selecione ao menos uma permissao" }, 400, req);
  }

  try {
    const role = await current.prisma.customRole.update({
      where: { id: roleId },
      data: {
        name,
        description: description || null,
        permissions,
      },
      include: { _count: { select: { users: true } } },
    });
    return json(serializeCustomRole(role), 200, req);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return json({ error: "Cargo nao encontrado" }, 404, req);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return json({ error: "Ja existe um cargo com esse nome" }, 409, req);
    }
    throw error;
  }
};

const handleRoleDelete = async (req: Request, roleId: string): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.USERS_MANAGE);
  if (denied) return denied;

  const role = await current.prisma.customRole.findUnique({
    where: { id: roleId },
    include: { _count: { select: { users: true } } },
  });

  if (!role) {
    return json({ error: "Cargo nao encontrado" }, 404, req);
  }
  if (role._count.users > 0) {
    return json(
      { error: "Esse cargo esta atribuido a usuarios e nao pode ser removido agora" },
      409,
      req,
    );
  }

  await current.prisma.customRole.delete({ where: { id: roleId } });
  return json({ ok: true }, 200, req);
};

const handleUserList = async (req: Request): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.USERS_MANAGE);
  if (denied) return denied;

  const users = await current.prisma.user.findMany({
    orderBy: [{ role: "asc" }, { createdAt: "desc" }],
    include: { customRole: true },
  });

  return json({ items: users.map(toPublicUser) }, 200, req);
};

const handleUserCreate = async (req: Request): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.USERS_MANAGE);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, req);
  }

  const input = body as Record<string, unknown>;
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const password = typeof input.password === "string" ? input.password : "";
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const rawRole = typeof input.role === "string" ? input.role.trim().toUpperCase() : "AGENT";
  const customRoleId = typeof input.customRoleId === "string" ? input.customRoleId.trim() : "";

  if (!email || !email.includes("@")) {
    return json({ error: "email valido e obrigatorio" }, 400, req);
  }
  if (password.length < 6) {
    return json({ error: "password deve ter ao menos 6 caracteres" }, 400, req);
  }

  let role: UserRole = "AGENT";
  let resolvedCustomRoleId: string | null = null;

  if (customRoleId) {
    const customRole = await current.prisma.customRole.findUnique({
      where: { id: customRoleId },
    });
    if (!customRole) {
      return json({ error: "Cargo personalizado nao encontrado" }, 400, req);
    }
    role = "CUSTOM";
    resolvedCustomRoleId = customRole.id;
  } else if (rawRole === "CUSTOM") {
    return json({ error: "Selecione um cargo personalizado valido" }, 400, req);
  } else if (VALID_PRESET_USER_ROLES.has(rawRole as UserRole)) {
    role = rawRole as UserRole;
  }

  const existing = await current.prisma.user.findUnique({ where: { email } });
  if (existing) {
    return json({ error: "Usuario ja existe" }, 409, req);
  }

  const passwordHash = await Bun.password.hash(password);
  const user = await current.prisma.user.create({
    data: {
      email,
      passwordHash,
      name: name || null,
      role,
      customRoleId: resolvedCustomRoleId,
    },
    include: { customRole: true },
  });

  return json(
    toPublicUser(user),
    201,
    req,
  );
};

// ── Batch actions on contacts ────────────────────────────────
const handleUserDelete = async (req: Request, userId: string): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.USERS_MANAGE);
  if (denied) return denied;

  if (userId === current.user.id) {
    return json({ error: "Nao e permitido excluir seu proprio usuario" }, 400, req);
  }

  const target = await current.prisma.user.findUnique({
    where: { id: userId },
    include: { customRole: true },
  });
  if (!target) {
    return json({ error: "Usuario nao encontrado" }, 404, req);
  }
  if (target.role === "ADMIN") {
    return json(
      { error: "Nao e permitido excluir ou alterar informacoes de usuario admin" },
      403,
      req,
    );
  }

  await current.prisma.user.delete({ where: { id: userId } });
  return json({ ok: true }, 200, req);
};

const handleContactsBatch = async (req: Request): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, req);
  }

  const input = body as Record<string, unknown>;
  const waIds = Array.isArray(input.waIds) ? (input.waIds as string[]) : [];
  if (!waIds.length || waIds.length > 200) {
    return json({ error: "waIds must be an array with 1–200 items" }, 400, req);
  }

  const action = typeof input.action === "string" ? input.action : "";
  let updated = 0;

  if (action === "changeStatus") {
    const denied = requirePermission(current, req, PERMISSIONS.LEADS_MANAGE_STATUS);
    if (denied) return denied;
    const status = typeof input.status === "string" ? input.status : "";
    if (!["open", "won", "lost"].includes(status)) {
      return json({ error: "Invalid status" }, 400, req);
    }
    const result = await current.prisma.contact.updateMany({
      where: { waId: { in: waIds } },
      data: { leadStatus: status },
    });
    updated = result.count;
  } else if (action === "addTag") {
    const denied = requirePermission(current, req, PERMISSIONS.CONTACTS_MANAGE_TAGS);
    if (denied) return denied;
    const tagId = typeof input.tagId === "number" ? input.tagId : Number(input.tagId);
    if (!Number.isFinite(tagId)) {
      return json({ error: "tagId required" }, 400, req);
    }
    const contacts = await current.prisma.contact.findMany({
      where: { waId: { in: waIds } },
      select: { id: true },
    });
    const data = contacts.map((c) => ({ contactId: c.id, tagId }));
    if (data.length) {
      await current.prisma.contactTag.createMany({ data, skipDuplicates: true });
      updated = data.length;
    }
  } else if (action === "toggleBot") {
    const denied = requirePermission(current, req, PERMISSIONS.CONTACTS_MANAGE_BOT);
    if (denied) return denied;
    const botEnabled = input.botEnabled === true;
    const result = await current.prisma.contact.updateMany({
      where: { waId: { in: waIds } },
      data: botEnabled
        ? buildResolvedHandoffState(current.user.id)
        : buildQueuedHandoffState("Bot desativado em lote no painel"),
    });
    updated = result.count;
    if (botEnabled) {
      for (const contactWaId of waIds) {
        void replyPendingContactAfterBotResume(current.prisma, contactWaId);
      }
    }
  } else if (action === "requestHandoff") {
    const denied = requirePermission(current, req, PERMISSIONS.CONTACTS_MANAGE_HANDOFF);
    if (denied) return denied;
    const result = await current.prisma.contact.updateMany({
      where: { waId: { in: waIds } },
      data: buildQueuedHandoffState("Solicitacao em lote via painel"),
    });
    updated = result.count;
  } else {
    return json({ error: "Unknown action" }, 400, req);
  }

  broadcast("contacts:batch", { action, count: updated });
  void invalidateDashboardCaches();
  return json({ ok: true, updated }, 200, req);
};

const handleContactBotToggle = async (
  req: Request,
  waId: string,
): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.CONTACTS_MANAGE_BOT);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, req);
  }

  const input = body as Record<string, unknown>;
  if (typeof input.botEnabled !== "boolean") {
    return json({ error: "botEnabled must be a boolean" }, 400, req);
  }
  const botEnabled = input.botEnabled;

  const existing = await current.prisma.contact.findUnique({
    where: { waId },
    select: {
      waId: true,
      handoffRequested: true,
      handoffStatus: true,
      handoffAssignedAt: true,
      handoffAssignedToUserId: true,
      handoffFirstHumanReplyAt: true,
    },
  });
  if (!existing) {
    return json({ error: "Contact not found" }, 404, req);
  }

  const data = botEnabled
    ? buildResolvedHandoffState(current.user.id)
    : buildQueuedHandoffState("Bot desativado manualmente no painel");

  let contact;
  try {
    contact = await current.prisma.contact.update({
      where: { waId },
      data,
    });
  } catch {
    return json({ error: "Contact not found" }, 404, req);
  }

  broadcast("contact:updated", {
    waId,
    botEnabled: contact.botEnabled,
    handoffRequested: contact.handoffRequested,
    handoffStatus: contact.handoffStatus,
  });
  void invalidateDashboardCaches();
  void emitAlertsSummary(current.prisma);
  if (contact.botEnabled && !contact.handoffRequested) {
    void replyPendingContactAfterBotResume(current.prisma, waId);
  }
  return json(contact, 200, req);
};

const handleContactSend = async (
  req: Request,
  waId: string,
): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.CONVERSATIONS_REPLY);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, req);
  }

  const input = body as Record<string, unknown>;
  const message = typeof input.message === "string" ? input.message.trim() : "";
  if (!message) {
    return json({ error: "message is required" }, 400, req);
  }

  const existing = await current.prisma.contact.findUnique({
    where: { waId },
    select: {
      id: true,
      waId: true,
      channel: true,
      externalId: true,
      handoffRequested: true,
      handoffStatus: true,
      handoffAssignedAt: true,
      handoffAssignedToUserId: true,
      handoffFirstHumanReplyAt: true,
      instagramConnection: {
        select: {
          pageId: true,
          pageAccessToken: true,
          instagramAccountId: true,
        },
      },
    },
  });
  if (!existing) {
    return json({ error: "Contact not found" }, 404, req);
  }

  const existingHandoffStatus = deriveHandoffStatus(existing);
  const shouldAdvanceHandoff =
    existingHandoffStatus !== "NONE" && existingHandoffStatus !== "RESOLVED";

  try {
    await sendTextToTarget(existing, message, {
      allowHumanAgentTag: shouldAdvanceHandoff,
    });
  } catch (error) {
    if (error instanceof InstagramApiError) {
      console.error(`[contact-send:${waId}] instagram send failed`, error);
      return json(
        {
          error:
            error.details ??
            "Nao foi possivel enviar mensagem no Instagram. Verifique token/permissoes da conexao.",
        },
        error.status >= 400 && error.status < 600 ? error.status : 502,
        req,
      );
    }
    if (error instanceof WhatsAppApiError) {
      console.error(`[contact-send:${waId}] whatsapp send failed`, error);
      return json(
        {
          error:
            error.details ??
            "Nao foi possivel enviar mensagem no WhatsApp. Verifique token/permissoes do numero.",
        },
        error.status >= 400 && error.status < 600 ? error.status : 502,
        req,
      );
    }
    console.error(`[contact-send:${waId}] send failed`, error);
    return json({ error: "Falha ao enviar mensagem para o contato." }, 502, req);
  }
  await persistTurn(waId, "assistant", message, {
    source: "AGENT",
    sentByUserId: current.user.id,
    channel: inferContactChannel(existing.channel, waId),
    externalId: existing.externalId,
  });

  let handoffProgress:
    | {
        handoffStatus: HandoffStatusValue;
        assignedAt: string | null;
        firstHumanReplyAt: string | null;
      }
    | null = null;
  if (shouldAdvanceHandoff) {
    const updatedContact = await current.prisma.contact.update({
      where: { waId },
      data: buildInProgressHandoffState(existing, current.user.id),
      select: {
        handoffStatus: true,
        handoffAssignedAt: true,
        handoffFirstHumanReplyAt: true,
      },
    });
    handoffProgress = {
      handoffStatus: deriveHandoffStatus(updatedContact),
      assignedAt: updatedContact.handoffAssignedAt?.toISOString() ?? null,
      firstHumanReplyAt: updatedContact.handoffFirstHumanReplyAt?.toISOString() ?? null,
    };
  }

  broadcast("message:sent", {
    phone: waId,
    role: "assistant",
    source: "AGENT",
    content: message,
    sentBy: current.user.email,
  });
  broadcast("message:new", {
    phone: waId,
    role: "assistant",
    source: "AGENT",
    content: message,
    sentBy: current.user.email,
  });
  if (handoffProgress) {
    broadcast("handoff:updated", {
      waId,
      assignedTo: current.user.email,
      assignedAt: handoffProgress.assignedAt,
      handoffStatus: handoffProgress.handoffStatus,
      firstHumanReplyAt: handoffProgress.firstHumanReplyAt,
    });
  }
  void emitAlertsSummary(current.prisma);

  return json({ ok: true }, 200, req);
};

// ── Phase 2: FAQ endpoints ─────────────────────────────────────────

const handleFaqList = async (req: Request): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.FAQS_VIEW);
  if (denied) return denied;

  const url = new URL(req.url);
  const limit = Math.min(
    100,
    Math.max(1, Number(url.searchParams.get("limit") ?? "50") || 50),
  );
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? "0") || 0);
  const search = url.searchParams.get("search")?.trim();
  const isActiveParam = url.searchParams.get("isActive");
  const subject = url.searchParams.get("subject")?.trim();
  const faqType = url.searchParams.get("faqType")?.trim();
  const edition = url.searchParams.get("edition")?.trim();

  const where: Prisma.FaqWhereInput = {};
  if (search) {
    where.OR = [
      { question: { contains: search, mode: "insensitive" } },
      { answer: { contains: search, mode: "insensitive" } },
      { content: { contains: search, mode: "insensitive" } },
      { subject: { contains: search, mode: "insensitive" } },
    ];
  }
  if (isActiveParam === "true") where.isActive = true;
  if (isActiveParam === "false") where.isActive = false;
  if (subject) where.subject = { equals: subject, mode: "insensitive" };
  if (faqType) where.faqType = faqType;
  if (edition) where.edition = { equals: edition, mode: "insensitive" };

  const [items, total] = await Promise.all([
    current.prisma.faq.findMany({ where, orderBy: { createdAt: "desc" }, skip: offset, take: limit }),
    current.prisma.faq.count({ where }),
  ]);

  // Gather unique subjects and editions for filter dropdowns
  const [subjects, editions] = await Promise.all([
    current.prisma.faq.findMany({ distinct: ["subject"], select: { subject: true }, where: { subject: { not: null } } }),
    current.prisma.faq.findMany({ distinct: ["edition"], select: { edition: true }, where: { edition: { not: null } } }),
  ]);

  return json({
    items,
    total,
    limit,
    offset,
    subjects: subjects.map((s) => s.subject).filter(Boolean),
    editions: editions.map((e) => e.edition).filter(Boolean),
  }, 200, req);
};

const FAQ_CONTENT_ONLY_PREFIX = "__content__:";

const isGeneratedFaqQuestion = (question: string | null | undefined): boolean =>
  typeof question === "string" && question.startsWith(FAQ_CONTENT_ONLY_PREFIX);

const buildGeneratedFaqQuestion = (): string =>
  `${FAQ_CONTENT_ONLY_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const handleFaqCreate = async (req: Request): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.FAQS_MANAGE);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, req);
  }

  const input = body as Record<string, unknown>;
  const question = typeof input.question === "string" ? input.question.trim() : "";
  const answer = typeof input.answer === "string" ? input.answer.trim() : "";
  const content = typeof input.content === "string" ? input.content.trim() : "";
  if ((!question || !answer) && !content) {
    return json({ error: "content is required" }, 400, req);
  }

  const faq = await current.prisma.faq.create({
    data: {
      question: question || buildGeneratedFaqQuestion(),
      answer: answer || content,
      subject: typeof input.subject === "string" ? input.subject.trim() || "geral" : "geral",
      edition: typeof input.edition === "string" ? input.edition.trim() || null : null,
      faqType: typeof input.faqType === "string" ? input.faqType.trim() || "qa" : "qa",
      content: content || null,
      isActive: input.isActive !== false,
    },
  });
  void invalidateReplyCaches();
  return json(faq, 201, req);
};

const handleFaqUpdate = async (req: Request, id: number): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.FAQS_MANAGE);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, req);
  }

  const input = body as Record<string, unknown>;
  const existing = await current.prisma.faq.findUnique({
    where: { id },
    select: { question: true, answer: true, content: true },
  });
  if (!existing) {
    return json({ error: "FAQ not found" }, 404, req);
  }

  const data: Record<string, unknown> = {};
  if (typeof input.question === "string") data.question = input.question.trim();
  if (typeof input.answer === "string") data.answer = input.answer.trim();
  if (typeof input.isActive === "boolean") data.isActive = input.isActive;
  if (typeof input.subject === "string") data.subject = input.subject.trim() || "geral";
  if (typeof input.edition === "string") data.edition = input.edition.trim() || null;
  if (input.edition === null) data.edition = null;
  if (typeof input.faqType === "string") data.faqType = input.faqType.trim() || "qa";
  if (typeof input.content === "string") data.content = input.content.trim() || null;
  if (input.content === null) data.content = null;

  if (typeof data.question === "string" && !data.question.trim()) {
    delete data.question;
  }
  if (typeof data.answer === "string" && !data.answer.trim()) {
    delete data.answer;
  }

  const nextContent =
    typeof data.content === "string"
      ? data.content
      : data.content === null
        ? null
        : existing.content;

  if (isGeneratedFaqQuestion(existing.question) && typeof nextContent === "string" && nextContent.trim()) {
    if (!("answer" in data)) {
      data.answer = nextContent.trim();
    }
  }

  const faq = await current.prisma.faq.update({ where: { id }, data });
  void invalidateReplyCaches();
  return json(faq, 200, req);
};

const handleFaqDelete = async (req: Request, id: number): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.FAQS_MANAGE);
  if (denied) return denied;

  await current.prisma.faq.delete({ where: { id } });
  void invalidateReplyCaches();
  return json({ ok: true }, 200, req);
};

// ── Phase 2: Template endpoints ────────────────────────────────────

const handleTemplateList = async (req: Request): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.TEMPLATES_VIEW);
  if (denied) return denied;

  const url = new URL(req.url);
  const limit = Math.min(
    100,
    Math.max(1, Number(url.searchParams.get("limit") ?? "50") || 50),
  );
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? "0") || 0);
  const search = url.searchParams.get("search")?.trim();
  const category = url.searchParams.get("category")?.trim();

  const where: Prisma.MessageTemplateWhereInput = {};
  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { body: { contains: search, mode: "insensitive" } },
    ];
  }
  if (category) {
    where.category = { equals: category, mode: "insensitive" };
  }

  const [items, total] = await Promise.all([
    current.prisma.messageTemplate.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
    }),
    current.prisma.messageTemplate.count({ where }),
  ]);

  return json({ items, total, limit, offset }, 200, req);
};

const handleTemplateCreate = async (req: Request): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.TEMPLATES_MANAGE);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, req);
  }

  const input = body as Record<string, unknown>;
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const bodyText = typeof input.body === "string" ? input.body.trim() : "";
  if (!title || !bodyText) {
    return json({ error: "title and body are required" }, 400, req);
  }

  const template = await current.prisma.messageTemplate.create({
    data: {
      title,
      body: bodyText,
      category: typeof input.category === "string" ? input.category.trim() : "geral",
    },
  });
  return json(template, 201, req);
};

const handleTemplateUpdate = async (req: Request, id: number): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.TEMPLATES_MANAGE);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, req);
  }

  const input = body as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  if (typeof input.title === "string") data.title = input.title.trim();
  if (typeof input.body === "string") data.body = input.body.trim();
  if (typeof input.category === "string") data.category = input.category.trim();

  const template = await current.prisma.messageTemplate.update({ where: { id }, data });
  return json(template, 200, req);
};

const handleTemplateDelete = async (req: Request, id: number): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.TEMPLATES_MANAGE);
  if (denied) return denied;

  await current.prisma.messageTemplate.delete({ where: { id } });
  return json({ ok: true }, 200, req);
};

// ── Phase 2: Tag endpoints ─────────────────────────────────────────

const handleTagList = async (req: Request): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.TAGS_VIEW);
  if (denied) return denied;

  const url = new URL(req.url);
  const limit = Math.min(
    100,
    Math.max(1, Number(url.searchParams.get("limit") ?? "100") || 100),
  );
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? "0") || 0);
  const search = url.searchParams.get("search")?.trim();

  const where: Prisma.TagWhereInput = {};
  if (search) {
    where.name = { contains: search, mode: "insensitive" };
  }

  const [items, total] = await Promise.all([
    current.prisma.tag.findMany({ where, orderBy: { name: "asc" }, skip: offset, take: limit }),
    current.prisma.tag.count({ where }),
  ]);

  return json({ items, total, limit, offset }, 200, req);
};

const handleTagCreate = async (req: Request): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.TAGS_MANAGE);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, req);
  }

  const input = body as Record<string, unknown>;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) return json({ error: "name is required" }, 400, req);

  const tag = await current.prisma.tag.create({
    data: {
      name,
      color: typeof input.color === "string" ? input.color.trim() : "#06b6d4",
    },
  });
  void invalidateDashboardCaches();
  return json(tag, 201, req);
};

const handleTagDelete = async (req: Request, id: number): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.TAGS_MANAGE);
  if (denied) return denied;

  await current.prisma.tag.delete({ where: { id } });
  void invalidateDashboardCaches();
  return json({ ok: true }, 200, req);
};

const handleTagUpdate = async (req: Request, id: number): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.TAGS_MANAGE);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, req);
  }

  const input = body as Record<string, unknown>;
  const data: Prisma.TagUpdateInput = {};

  if (typeof input.name === "string") {
    const name = input.name.trim();
    if (!name) return json({ error: "name cannot be empty" }, 400, req);
    data.name = name;
  }
  if (typeof input.color === "string") {
    const color = input.color.trim();
    if (color) data.color = color;
  }

  if (!Object.keys(data).length) {
    return json({ error: "No valid fields provided" }, 400, req);
  }

  const tag = await current.prisma.tag.update({ where: { id }, data });
  broadcast("contact:updated", { action: "tag:updated", tagId: id });
  void invalidateDashboardCaches();
  return json(tag, 200, req);
};

// ── Contact audit log endpoint ───────────────────────────────
const handleContactAuditLog = async (
  req: Request,
  waId: string,
): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.CONTACTS_VIEW);
  if (denied) return denied;

  const contact = await current.prisma.contact.findUnique({
    where: { waId },
    select: { id: true },
  });
  if (!contact) return json({ error: "Contact not found" }, 404, req);

  if (!contactAuditLogAvailable) {
    return json([], 200, req);
  }

  try {
    const logs = await (current.prisma as any).contactAuditLog.findMany({
      where: { contactId: contact.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { user: { select: { name: true, email: true } } },
    });

    return json(logs, 200, req);
  } catch (error) {
    if (isPrismaMissingTableError(error, "public.ContactAuditLog")) {
      disableContactAuditLog("missing table public.ContactAuditLog");
      return json([], 200, req);
    }
    throw error;
  }
};

const handleContactTagAdd = async (
  req: Request,
  waId: string,
): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.CONTACTS_MANAGE_TAGS);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, req);
  }

  const input = body as Record<string, unknown>;
  const tagId = Number(input.tagId);
  if (!tagId) return json({ error: "tagId is required" }, 400, req);

  const contact = await current.prisma.contact.findUnique({ where: { waId }, select: { id: true } });
  if (!contact) return json({ error: "Contact not found" }, 404, req);

  const contactTag = await current.prisma.contactTag.upsert({
    where: { contactId_tagId: { contactId: contact.id, tagId } },
    create: { contactId: contact.id, tagId },
    update: {},
    include: { tag: true },
  });

  broadcast("contact:updated", { waId, action: "tag:added", tagId });
  void invalidateDashboardCaches();
  return json(contactTag, 201, req);
};

const handleContactTagRemove = async (
  req: Request,
  waId: string,
  tagId: number,
): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.CONTACTS_MANAGE_TAGS);
  if (denied) return denied;

  const contact = await current.prisma.contact.findUnique({ where: { waId }, select: { id: true } });
  if (!contact) return json({ error: "Contact not found" }, 404, req);

  await current.prisma.contactTag.deleteMany({
    where: { contactId: contact.id, tagId },
  });

  broadcast("contact:updated", { waId, action: "tag:removed", tagId });
  void invalidateDashboardCaches();
  return json({ ok: true }, 200, req);
};

const handleHandoffQueueList = async (req: Request): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.HANDOFF_VIEW);
  if (denied) return denied;

  const url = new URL(req.url);
  const onlyMineParam = url.searchParams.get("onlyMine");
  const onlyMine = onlyMineParam === "1" || onlyMineParam === "true";
  const now = new Date();

  const contacts = await current.prisma.contact.findMany({
    where: activeHandoffWhere(),
    include: {
      stage: {
        select: {
          id: true,
          name: true,
          color: true,
        },
      },
      handoffAssignedToUser: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          body: true,
          createdAt: true,
          direction: true,
          source: true,
          sentByUser: {
            select: { email: true, name: true },
          },
        },
      },
      tasks: {
        where: {
          status: { in: ["open", "in_progress"] },
        },
        orderBy: { dueAt: "asc" },
        take: 5,
        select: {
          id: true,
          title: true,
          dueAt: true,
          status: true,
          priority: true,
        },
      },
    },
    orderBy: [{ handoffAt: "asc" }, { lastInteractionAt: "desc" }],
    take: 250,
  });

  const queue = contacts
    .map((contact) => {
      const handoffStatus = deriveHandoffStatus(contact);
      const startedAt = contact.handoffAt ?? contact.lastInteractionAt ?? contact.createdAt;
      const waitMinutes = computeHandoffWaitMinutes(startedAt, now);
      const slaLevel = classifyHandoffSla(waitMinutes);
      return {
        waId: contact.waId,
        name: contact.name,
        stage: contact.stage,
        handoffStatus,
        handoffReason: contact.handoffReason,
        handoffAt: contact.handoffAt,
        waitMinutes,
        slaLevel,
        assignedTo: contact.handoffAssignedToUser?.email ?? null,
        assignedAt: contact.handoffAssignedAt?.toISOString() ?? null,
        firstHumanReplyAt: contact.handoffFirstHumanReplyAt?.toISOString() ?? null,
        aiSummary: contact.aiSummary ?? null,
        triageMissing: computeMissingLeadFields(contact),
        triageSnapshot: {
          email: contact.email,
          tournament: contact.tournament,
          eventDate: contact.eventDate,
          category: contact.category,
          city: contact.city,
          teamName: contact.teamName,
          playersCount: contact.playersCount,
        },
        openTasks: contact.tasks,
        latestMessage: contact.messages[0] ?? null,
      };
    })
    .filter((item) => (onlyMine ? item.assignedTo === current.user.email : true))
    .sort((a, b) => {
      const rankForSla = (level: string): number => {
        if (level === "critical") return 3;
        if (level === "warning") return 2;
        return 1;
      };
      const rankDiff = rankForSla(b.slaLevel) - rankForSla(a.slaLevel);
      if (rankDiff !== 0) return rankDiff;
      return b.waitMinutes - a.waitMinutes;
    });

  return json(queue, 200, req);
};

const handleHandoffAssign = async (
  req: Request,
  waId: string,
): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.HANDOFF_ASSIGN);
  if (denied) return denied;

  let body: unknown = {};
  if (req.method === "PUT") {
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400, req);
    }
  }

  const input =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};

  const ownerRaw =
    typeof input.owner === "string"
      ? input.owner.trim()
      : input.owner === null
        ? null
        : undefined;

  const contact = await current.prisma.contact.findUnique({
    where: { waId },
    select: {
      waId: true,
      handoffRequested: true,
      handoffStatus: true,
      handoffAssignedAt: true,
      handoffAssignedToUserId: true,
      handoffFirstHumanReplyAt: true,
    },
  });
  if (!contact) return json({ error: "Contact not found" }, 404, req);
  if (deriveHandoffStatus(contact) === "NONE" || deriveHandoffStatus(contact) === "RESOLVED") {
    return json({ error: "Contact is not in human handoff queue" }, 400, req);
  }

  let assignee:
    | {
        id: string;
        email: string;
      }
    | null = null;

  let data: Prisma.ContactUncheckedUpdateInput;
  if (ownerRaw === null) {
    data = buildReleasedHandoffState();
  } else {
    const owner = ownerRaw && ownerRaw.length > 0 ? ownerRaw : current.user.email;
    assignee = await current.prisma.user.findUnique({
      where: { email: owner },
      select: { id: true, email: true },
    });
    if (!assignee) {
      return json({ error: "Owner not found" }, 404, req);
    }
    data = buildAssignedHandoffState(contact, assignee.id);
  }

  const updatedContact = await current.prisma.contact.update({
    where: { waId },
    data,
    select: {
      waId: true,
      handoffStatus: true,
      handoffAssignedAt: true,
      handoffFirstHumanReplyAt: true,
      handoffAssignedToUser: {
        select: {
          email: true,
        },
      },
    },
  });

  const payload = {
    waId,
    assignedTo: updatedContact.handoffAssignedToUser?.email ?? null,
    assignedAt: updatedContact.handoffAssignedAt?.toISOString() ?? null,
    handoffStatus: deriveHandoffStatus(updatedContact),
    firstHumanReplyAt: updatedContact.handoffFirstHumanReplyAt?.toISOString() ?? null,
  };

  broadcast("handoff:updated", payload as unknown as Record<string, unknown>);
  void invalidateDashboardCaches();
  void emitAlertsSummary(current.prisma);
  return json(payload, 200, req);
};

const handleTaskList = async (req: Request): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.TASKS_VIEW);
  if (denied) return denied;

  const url = new URL(req.url);
  const waId = url.searchParams.get("waId")?.trim();
  const status = url.searchParams.get("status")?.trim().toLowerCase();
  const priority = url.searchParams.get("priority")?.trim().toLowerCase();
  const contactIdParam = url.searchParams.get("contactId");

  if (status && !VALID_TASK_STATUS.has(status)) {
    return json(
      { error: "status must be one of: open, in_progress, done, cancelled" },
      400,
      req,
    );
  }
  if (priority && !VALID_TASK_PRIORITY.has(priority)) {
    return json(
      { error: "priority must be one of: low, medium, high, urgent" },
      400,
      req,
    );
  }

  const where: Prisma.TaskWhereInput = {};
  if (waId) where.contact = { waId };
  if (status) where.status = status;
  if (priority) where.priority = priority;
  if (contactIdParam) {
    const contactId = Number(contactIdParam);
    if (!Number.isFinite(contactId)) {
      return json({ error: "contactId must be numeric" }, 400, req);
    }
    where.contactId = contactId;
  }

  const tasks = await current.prisma.task.findMany({
    where,
    include: {
      contact: {
        select: {
          id: true,
          waId: true,
          name: true,
        },
      },
    },
    orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
    take: 500,
  });

  return json(tasks, 200, req);
};

const handleTaskCreate = async (req: Request): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.TASKS_MANAGE);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, req);
  }

  const input =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};

  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title) {
    return json({ error: "title is required" }, 400, req);
  }

  const dueAt = parseDateInput(input.dueAt);
  if (!dueAt) {
    return json({ error: "dueAt must be a valid date string" }, 400, req);
  }

  const status =
    typeof input.status === "string" ? input.status.trim().toLowerCase() : "open";
  if (!VALID_TASK_STATUS.has(status)) {
    return json(
      { error: "status must be one of: open, in_progress, done, cancelled" },
      400,
      req,
    );
  }

  const priority =
    typeof input.priority === "string"
      ? input.priority.trim().toLowerCase()
      : "medium";
  if (!VALID_TASK_PRIORITY.has(priority)) {
    return json(
      { error: "priority must be one of: low, medium, high, urgent" },
      400,
      req,
    );
  }

  const description = normalizeNullableText(input.description);
  const waId = typeof input.waId === "string" ? input.waId.trim() : "";
  const contactIdParam = hasOwn(input, "contactId") ? Number(input.contactId) : null;

  let contactId: number | null = null;
  if (waId) {
    const contact = await current.prisma.contact.findUnique({
      where: { waId },
      select: { id: true },
    });
    if (!contact) return json({ error: "Contact not found" }, 404, req);
    contactId = contact.id;
  } else if (contactIdParam && Number.isFinite(contactIdParam)) {
    const contact = await current.prisma.contact.findUnique({
      where: { id: contactIdParam },
      select: { id: true },
    });
    if (!contact) return json({ error: "Contact not found" }, 404, req);
    contactId = contact.id;
  } else {
    return json({ error: "waId or contactId is required" }, 400, req);
  }

  const task = await current.prisma.task.create({
    data: {
      contactId,
      title,
      description: description ?? null,
      dueAt,
      status,
      priority,
      completedAt: status === "done" ? new Date() : null,
    },
    include: {
      contact: {
        select: {
          id: true,
          waId: true,
          name: true,
        },
      },
    },
  });

  broadcast("task:updated", {
    action: "task:created",
    taskId: task.id,
    waId: task.contact.waId,
  });
  void invalidateDashboardCaches();
  void emitAlertsSummary(current.prisma);
  return json(task, 201, req);
};

const handleTaskUpdate = async (req: Request, id: number): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.TASKS_MANAGE);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, req);
  }

  const input =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};

  const data: Prisma.TaskUpdateInput = {};
  let nextStatus: string | undefined;

  if (hasOwn(input, "title") && typeof input.title === "string") {
    const title = input.title.trim();
    if (!title) return json({ error: "title cannot be empty" }, 400, req);
    data.title = title;
  }
  if (hasOwn(input, "description")) {
    const description = normalizeNullableText(input.description);
    if (description !== undefined) data.description = description;
  }
  if (hasOwn(input, "dueAt")) {
    const dueAt = parseDateInput(input.dueAt);
    if (!dueAt) {
      return json({ error: "dueAt must be a valid date string" }, 400, req);
    }
    data.dueAt = dueAt;
  }
  if (hasOwn(input, "status")) {
    const status =
      typeof input.status === "string" ? input.status.trim().toLowerCase() : "";
    if (!VALID_TASK_STATUS.has(status)) {
      return json(
        { error: "status must be one of: open, in_progress, done, cancelled" },
        400,
        req,
      );
    }
    data.status = status;
    nextStatus = status;
  }
  if (hasOwn(input, "priority")) {
    const priority =
      typeof input.priority === "string" ? input.priority.trim().toLowerCase() : "";
    if (!VALID_TASK_PRIORITY.has(priority)) {
      return json(
        { error: "priority must be one of: low, medium, high, urgent" },
        400,
        req,
      );
    }
    data.priority = priority;
  }
  if (hasOwn(input, "waId") && typeof input.waId === "string") {
    const waId = input.waId.trim();
    if (!waId) {
      return json({ error: "waId cannot be empty" }, 400, req);
    }
    const contact = await current.prisma.contact.findUnique({
      where: { waId },
      select: { id: true },
    });
    if (!contact) return json({ error: "Contact not found" }, 404, req);
    data.contact = { connect: { id: contact.id } };
  }
  if (hasOwn(input, "contactId")) {
    const contactId = Number(input.contactId);
    if (!Number.isFinite(contactId)) {
      return json({ error: "contactId must be numeric" }, 400, req);
    }
    const contact = await current.prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true },
    });
    if (!contact) return json({ error: "Contact not found" }, 404, req);
    data.contact = { connect: { id: contact.id } };
  }

  if (nextStatus === "done") {
    data.completedAt = new Date();
  } else if (nextStatus) {
    data.completedAt = null;
  }

  if (!Object.keys(data).length) {
    return json({ error: "No valid fields provided" }, 400, req);
  }

  let task;
  try {
    task = await current.prisma.task.update({
      where: { id },
      data,
      include: {
        contact: {
          select: {
            id: true,
            waId: true,
            name: true,
          },
        },
      },
    });
  } catch {
    return json({ error: "Task not found" }, 404, req);
  }

  broadcast("task:updated", {
    action: "task:updated",
    taskId: task.id,
    waId: task.contact.waId,
  });
  void invalidateDashboardCaches();
  void emitAlertsSummary(current.prisma);
  return json(task, 200, req);
};

const handleTaskDelete = async (req: Request, id: number): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.TASKS_MANAGE);
  if (denied) return denied;

  let task;
  try {
    task = await current.prisma.task.delete({
      where: { id },
      select: {
        id: true,
        contact: {
          select: { waId: true },
        },
      },
    });
  } catch {
    return json({ error: "Task not found" }, 404, req);
  }

  broadcast("task:updated", {
    action: "task:deleted",
    taskId: task.id,
    waId: task.contact.waId,
  });
  void invalidateDashboardCaches();
  void emitAlertsSummary(current.prisma);
  return json({ ok: true }, 200, req);
};

// ── Audio endpoints ─────────────────────────────────────────────────

const ALLOWED_AUDIO_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/aac",
  "audio/x-m4a",
  "audio/m4a",
]);

const MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25 MB

const handleAudioList = async (req: Request): Promise<Response> => {
  try {
    const current = await getAuthenticatedUser(req);
    if (current instanceof Response) return current;
    const denied = requirePermission(current, req, PERMISSIONS.AUDIOS_VIEW);
    if (denied) return denied;

    const url = new URL(req.url);
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? "50") || 50));
    const offset = Math.max(0, Number(url.searchParams.get("offset") ?? "0") || 0);
    const search = url.searchParams.get("search")?.trim();
    const category = url.searchParams.get("category")?.trim();

    const where: Prisma.AudioWhereInput = {};
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { filename: { contains: search, mode: "insensitive" } },
      ];
    }
    if (category) {
      where.category = { equals: category, mode: "insensitive" };
    }

    const [items, total] = await Promise.all([
      current.prisma.audio.findMany({ where, orderBy: { createdAt: "desc" }, skip: offset, take: limit }),
      current.prisma.audio.count({ where }),
    ]);

    return json({ items, total, limit, offset }, 200, req);
  } catch (error) {
    console.error("handleAudioList error:", error);
    return json({ error: "Erro ao listar audios" }, 500, req);
  }
};

const handleAudioUpload = async (req: Request): Promise<Response> => {
  try {
    const current = await getAuthenticatedUser(req);
    if (current instanceof Response) return current;
    const denied = requirePermission(current, req, PERMISSIONS.AUDIOS_MANAGE);
    if (denied) return denied;

    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return json({ error: "multipart/form-data required" }, 400, req);
    }

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return json({ error: "Invalid form data" }, 400, req);
    }

    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return json({ error: "file field is required" }, 400, req);
    }

    if (!ALLOWED_AUDIO_TYPES.has(file.type) && !file.type.startsWith("audio/")) {
      return json({ error: "Only audio files are allowed" }, 400, req);
    }

    if (file.size > MAX_AUDIO_SIZE) {
      return json({ error: "File too large (max 25 MB)" }, 400, req);
    }

    const title = (formData.get("title") as string | null)?.trim() || file.name.replace(/\.[^.]+$/, "");
    const category = (formData.get("category") as string | null)?.trim() || "geral";

    const ext = file.name.split(".").pop() ?? "mp3";
    const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const r2Key = `audios/${Date.now()}_${safeFilename}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const url = await uploadToR2(r2Key, buffer, file.type);

    const audio = await current.prisma.audio.create({
      data: {
        title,
        filename: file.name,
        r2Key,
        url,
        mimeType: file.type || "audio/mpeg",
        sizeBytes: file.size,
        category,
      },
    });

    return json(audio, 201, req);
  } catch (error) {
    console.error("handleAudioUpload error:", error);
    return json({ error: `Erro ao enviar audio: ${error instanceof Error ? error.message : "unknown"}` }, 500, req);
  }
};

const handleAudioUpdate = async (req: Request, id: number): Promise<Response> => {
  try {
    const current = await getAuthenticatedUser(req);
    if (current instanceof Response) return current;
    const denied = requirePermission(current, req, PERMISSIONS.AUDIOS_MANAGE);
    if (denied) return denied;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400, req);
    }

    const input = body as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if (typeof input.title === "string") data.title = input.title.trim();
    if (typeof input.category === "string") data.category = input.category.trim();

    const audio = await current.prisma.audio.update({ where: { id }, data });
    return json(audio, 200, req);
  } catch (error) {
    console.error("handleAudioUpdate error:", error);
    return json({ error: error instanceof Error && error.message.includes("not found") ? "Audio nao encontrado" : "Erro ao atualizar audio" }, 500, req);
  }
};

const handleAudioStream = async (req: Request, id: number): Promise<Response> => {
  try {
    const current = await getAuthenticatedUser(req);
    if (current instanceof Response) return current;
    const denied = requirePermission(current, req, PERMISSIONS.AUDIOS_VIEW);
    if (denied) return denied;

    const audio = await current.prisma.audio.findUnique({
      where: { id },
      select: { r2Key: true, mimeType: true },
    });

    if (!audio?.r2Key) {
      return json({ error: "Audio nao encontrado" }, 404, req);
    }

    // Fetch directly from R2 using SDK (avoids CDN 403)
    const r2 = await getStreamFromR2(audio.r2Key);
    const headers = new Headers({
      "Content-Type": r2.contentType !== "application/octet-stream" ? r2.contentType : (audio.mimeType ?? "audio/ogg"),
      "Access-Control-Allow-Origin": resolveAllowOrigin(req),
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Cache-Control": "public, max-age=3600",
    });
    if (r2.contentLength != null) {
      headers.set("Content-Length", String(r2.contentLength));
    }

    return new Response(r2.body, { status: 200, headers });
  } catch (error) {
    console.error("[audio-stream] error:", error);
    return json({ error: "Erro ao acessar o arquivo" }, 500, req);
  }
};

const handleAudioStreamByUrl = async (req: Request): Promise<Response> => {
  try {
    const current = await getAuthenticatedUser(req);
    if (current instanceof Response) return current;
    const denied = requirePermission(current, req, PERMISSIONS.AUDIOS_VIEW);
    if (denied) return denied;

    const rawUrl = new URL(req.url).searchParams.get("url");
    if (!rawUrl) return json({ error: "Parametro url obrigatorio" }, 400, req);

    // Only proxy URLs that exist as audio records in our DB (prevents SSRF)
    const audio = await current.prisma.audio.findFirst({
      where: { url: rawUrl },
      select: { r2Key: true, mimeType: true },
    });

    if (!audio?.r2Key) {
      return json({ error: "Audio nao encontrado" }, 404, req);
    }

    // Fetch directly from R2 using SDK (avoids CDN 403)
    const r2 = await getStreamFromR2(audio.r2Key);
    const headers = new Headers({
      "Content-Type": r2.contentType !== "application/octet-stream" ? r2.contentType : (audio.mimeType ?? "audio/ogg"),
      "Access-Control-Allow-Origin": resolveAllowOrigin(req),
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Cache-Control": "public, max-age=3600",
    });
    if (r2.contentLength != null) {
      headers.set("Content-Length", String(r2.contentLength));
    }

    return new Response(r2.body, { status: 200, headers });
  } catch (error) {
    console.error("[audio-stream-url] error:", error);
    return json({ error: "Erro ao acessar o arquivo" }, 500, req);
  }
};

const handleAudioDelete = async (req: Request, id: number): Promise<Response> => {
  try {
    const current = await getAuthenticatedUser(req);
    if (current instanceof Response) return current;
    const denied = requirePermission(current, req, PERMISSIONS.AUDIOS_MANAGE);
    if (denied) return denied;

    let audio: { r2Key: string };
    try {
      audio = await current.prisma.audio.delete({
        where: { id },
        select: { r2Key: true },
      });
    } catch {
      return json({ error: "Audio nao encontrado" }, 404, req);
    }

    try {
      await deleteFromR2(audio.r2Key);
    } catch {
      // File already removed or R2 unavailable — DB record is already gone
    }

    return json({ ok: true }, 200, req);
  } catch (error) {
    console.error("handleAudioDelete error:", error);
    return json({ error: "Erro ao deletar audio" }, 500, req);
  }
};

// ── Phase 5: Lead Score calculation ────────────────────────────────

const computeLeadScore = (contact: {
  name?: string | null;
  email?: string | null;
  tournament?: string | null;
  eventDate?: string | null;
  category?: string | null;
  city?: string | null;
  teamName?: string | null;
  playersCount?: number | null;
  triageCompleted?: boolean;
  level?: string | null;
  objective?: string | null;
}, messageCount: number): number => {
  let score = 0;
  // Completude: 5 pts cada campo preenchido
  if (contact.name) score += 5;
  if (contact.email) score += 10;
  if (contact.tournament) score += 10;
  if (contact.eventDate) score += 5;
  if (contact.category) score += 5;
  if (contact.city) score += 5;
  if (contact.teamName) score += 5;
  if (typeof contact.playersCount === "number" && contact.playersCount > 0) score += 5;
  if (contact.level) score += 3;
  if (contact.objective) score += 3;
  if (contact.triageCompleted) score += 10;
  // Engajamento: pontos por mensagens
  if (messageCount >= 3) score += 5;
  if (messageCount >= 10) score += 10;
  if (messageCount >= 20) score += 5;
  return Math.min(100, score);
};

const updateLeadScore = async (
  prisma: PrismaClient,
  contactId: number,
): Promise<void> => {
  try {
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      select: {
        name: true, email: true, tournament: true, eventDate: true,
        category: true, city: true, teamName: true, playersCount: true,
        triageCompleted: true, level: true, objective: true,
      },
    });
    if (!contact) return;
    const msgCount = await prisma.message.count({ where: { contactId, direction: "in" } });
    const score = computeLeadScore(contact, msgCount);
    await prisma.contact.update({ where: { id: contactId }, data: { leadScore: score } });
  } catch (error) {
    console.error("[lead-score] failed for contact", contactId, error);
  }
};

// ── Phase 5: Advanced auto-tagging ─────────────────────────────────

const ADVANCED_TAG_RULES: Array<{
  name: string;
  color: string;
  match: (text: string) => boolean;
}> = [
  { name: "Valorant", color: "#ff4655", match: (t) => /\bvalorant\b/i.test(t) },
  { name: "CS2", color: "#de9b35", match: (t) => /\b(cs2|counter[- ]?strike|csgo|cs:go)\b/i.test(t) },
  { name: "League of Legends", color: "#c8aa6e", match: (t) => /\b(lol|league of legends)\b/i.test(t) },
  { name: "Fortnite", color: "#00bfff", match: (t) => /\bfortnite\b/i.test(t) },
  { name: "Free Fire", color: "#ff6a00", match: (t) => /\b(free ?fire|freefire|ff)\b/i.test(t) },
  { name: "Tem Time", color: "#10b981", match: (t) => /\b(tenho time|meu time|nosso time|tenho equipe|ja tenho)\b/i.test(t) },
  { name: "Procura Time", color: "#f59e0b", match: (t) => /\b(procur\w+ time|sem time|sozinho|preciso de time|nao tenho time)\b/i.test(t) },
  { name: "Interesse Mix", color: "#8b5cf6", match: (t) => /\b(mix|avulso|solo|individual)\b/i.test(t) },
];

const tryAdvancedAutoTag = async (
  prisma: PrismaClient,
  contactId: number,
  userMessage: string,
): Promise<void> => {
  try {
    const lowerMsg = userMessage.toLowerCase();
    const matchedRules = ADVANCED_TAG_RULES.filter((rule) => rule.match(lowerMsg));
    if (matchedRules.length === 0) return;

    for (const rule of matchedRules) {
      const tag = await prisma.tag.upsert({
        where: { name: rule.name },
        update: {},
        create: { name: rule.name, color: rule.color },
      });
      const existing = await prisma.contactTag.findUnique({
        where: { contactId_tagId: { contactId, tagId: tag.id } },
        select: { id: true },
      });
      if (!existing) {
        await prisma.contactTag.create({ data: { contactId, tagId: tag.id } });
        broadcast("contact:tagged", { contactId, tagName: rule.name, tagId: tag.id });
      }
    }
  } catch (error) {
    console.error("[advanced-auto-tag] failed for contact", contactId, error);
  }
};

// ── Phase 8: Reports / Analytics endpoints ─────────────────────────

const reportsPaths = new Set<string>([
  `${config.apiBasePath}/reports/leads`,
  "/reports/leads",
]);
const reportsPerformancePaths = new Set<string>([
  `${config.apiBasePath}/reports/performance`,
  "/reports/performance",
]);
const reportsExportPaths = new Set<string>([
  `${config.apiBasePath}/reports/export`,
  "/reports/export",
]);

const handleReportsLeads = async (req: Request): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.DASHBOARD_VIEW);
  if (denied) return denied;

  const url = new URL(req.url);
  const days = Math.min(365, Math.max(1, Number(url.searchParams.get("days") ?? "30") || 30));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [totalLeads, qualifiedLeads, wonLeads, lostLeads, totalMessages, avgResponseTime] = await Promise.all([
    current.prisma.contact.count({ where: { createdAt: { gte: since } } }),
    current.prisma.contact.count({ where: { createdAt: { gte: since }, triageCompleted: true } }),
    current.prisma.contact.count({ where: { createdAt: { gte: since }, leadStatus: "won" } }),
    current.prisma.contact.count({ where: { createdAt: { gte: since }, leadStatus: "lost" } }),
    current.prisma.message.count({ where: { createdAt: { gte: since } } }),
    current.prisma.$queryRawUnsafe<Array<{ avg_minutes: number | null }>>(
      `SELECT AVG(EXTRACT(EPOCH FROM (m2."createdAt" - m1."createdAt")) / 60) as avg_minutes
       FROM "Message" m1
       JOIN "Message" m2 ON m1."contactId" = m2."contactId"
       WHERE m1.direction = 'in' AND m2.direction = 'out'
       AND m2."createdAt" > m1."createdAt"
       AND m1."createdAt" >= $1
       AND m2."createdAt" = (
         SELECT MIN(sub."createdAt") FROM "Message" sub
         WHERE sub."contactId" = m1."contactId" AND sub.direction = 'out'
         AND sub."createdAt" > m1."createdAt"
       )`,
      since,
    ),
  ]);

  // Daily trend
  const dailyTrend = await current.prisma.$queryRawUnsafe<Array<{ day: string; count: bigint }>>(
    `SELECT TO_CHAR(DATE("createdAt"), 'YYYY-MM-DD') as day, COUNT(*)::bigint as count
     FROM "Contact" WHERE "createdAt" >= $1
     GROUP BY DATE("createdAt") ORDER BY DATE("createdAt")`,
    since,
  );

  return json({
    period: { days, since: since.toISOString() },
    totalLeads,
    qualifiedLeads,
    wonLeads,
    lostLeads,
    conversionRate: totalLeads > 0 ? Math.round((wonLeads / totalLeads) * 100) : 0,
    qualificationRate: totalLeads > 0 ? Math.round((qualifiedLeads / totalLeads) * 100) : 0,
    totalMessages,
    avgResponseMinutes: avgResponseTime[0]?.avg_minutes ? Math.round(avgResponseTime[0].avg_minutes * 10) / 10 : null,
    dailyTrend: dailyTrend.map((d) => ({ day: String(d.day), count: Number(d.count) })),
  }, 200, req);
};

const handleReportsPerformance = async (req: Request): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.DASHBOARD_VIEW);
  if (denied) return denied;

  const url = new URL(req.url);
  const days = Math.min(365, Math.max(1, Number(url.searchParams.get("days") ?? "30") || 30));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const agents = await current.prisma.user.findMany({
    where: { role: { in: ["ADMIN", "AGENT", "MANAGER"] } },
    select: { id: true, name: true, email: true },
  });

  const results = await Promise.all(
    agents.map(async (agent) => {
      const [messagesSent, handoffsResolved] = await Promise.all([
        current.prisma.message.count({
          where: { sentByUserId: agent.id, createdAt: { gte: since } },
        }),
        current.prisma.contact.count({
          where: { handoffResolvedByUserId: agent.id, handoffResolvedAt: { gte: since } },
        }),
      ]);
      return {
        agentId: agent.id,
        name: agent.name ?? agent.email,
        email: agent.email,
        messagesSent,
        handoffsResolved,
      };
    }),
  );

  return json({ period: { days, since: since.toISOString() }, agents: results }, 200, req);
};

const handleReportsExport = async (req: Request): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requirePermission(current, req, PERMISSIONS.CONTACTS_VIEW);
  if (denied) return denied;

  const contacts = await current.prisma.contact.findMany({
    include: { tags: { include: { tag: true } }, stage: true },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });

  const headers = ["waId", "name", "email", "tournament", "eventDate", "category", "city", "teamName", "playersCount", "leadStatus", "leadScore", "triageCompleted", "stage", "tags", "createdAt"];
  const csvRows = [headers.join(",")];

  for (const c of contacts) {
    const row = [
      c.waId,
      (c.name ?? "").replace(/,/g, ";"),
      c.email ?? "",
      (c.tournament ?? "").replace(/,/g, ";"),
      c.eventDate ?? "",
      c.category ?? "",
      (c.city ?? "").replace(/,/g, ";"),
      (c.teamName ?? "").replace(/,/g, ";"),
      c.playersCount ?? "",
      c.leadStatus,
      c.leadScore,
      c.triageCompleted ? "sim" : "nao",
      c.stage?.name ?? "",
      c.tags.map((ct) => ct.tag.name).join(";"),
      c.createdAt.toISOString().slice(0, 10),
    ];
    csvRows.push(row.join(","));
  }

  const csv = csvRows.join("\n");
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=contacts-export.csv",
      "Access-Control-Allow-Origin": resolveAllowOrigin(req),
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      Vary: "Origin",
    },
  });
};

// ── Helper: parse suffix from a matching prefix list ───────────────

const extractPathSuffix = (pathname: string, prefixes: string[]): string | null => {
  for (const prefix of prefixes) {
    if (pathname.startsWith(prefix)) {
      return decodeURIComponent(pathname.slice(prefix.length));
    }
  }
  return null;
};

const imageProxyPaths = new Set([
  `${config.apiBasePath}/media/image`,
  "/media/image",
]);

const resolveR2KeyFromPublicUrl = (rawUrl: string): string | null => {
  const normalizedUrl = rawUrl.trim();
  if (!normalizedUrl) return null;

  const normalizedPublicUrl = config.cloudflarePublicUrl?.replace(/\/+$/, "");
  if (normalizedPublicUrl && normalizedUrl.startsWith(`${normalizedPublicUrl}/`)) {
    return normalizedUrl.slice(normalizedPublicUrl.length + 1);
  }

  if (config.cloudflareAccountId && config.cloudflareBucketName) {
    const r2BaseUrl =
      `https://${config.cloudflareAccountId}.r2.cloudflarestorage.com/${config.cloudflareBucketName}`;
    if (normalizedUrl.startsWith(`${r2BaseUrl}/`)) {
      return normalizedUrl.slice(r2BaseUrl.length + 1);
    }
  }

  return null;
};

const handleInboundImageProxy = async (req: Request): Promise<Response> => {
  try {
    const requestUrl = new URL(req.url);
    const rawUrl = requestUrl.searchParams.get("url")?.trim();
    const key = requestUrl.searchParams.get("key")?.trim() || (rawUrl ? resolveR2KeyFromPublicUrl(rawUrl) : null);

    if (!key) {
      return json({ error: "Parametro url ou key obrigatorio" }, 400, req);
    }

    const r2 = await getStreamFromR2(key);
    const headers = new Headers({
      "Content-Type": r2.contentType !== "application/octet-stream" ? r2.contentType : "image/jpeg",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Cache-Control": "public, max-age=3600",
    });

    if (r2.contentLength != null) {
      headers.set("Content-Length", String(r2.contentLength));
    }

    return new Response(r2.body, { status: 200, headers });
  } catch (error) {
    console.error("[image-stream] error:", error);
    return json({ error: "Erro ao acessar a imagem" }, 500, req);
  }
};

if (config.enableDb) {
  void (async () => {
    const prisma = await getPrismaClient();
    if (!prisma) return;

    try {
      await auth.ensureAdminUser(prisma);
    } catch (error) {
      console.error("Failed to ensure admin user", error);
    }
  })();
}

const server = Bun.serve<WsUserData>({
  port: config.apiPort,
  idleTimeout: 30,
  async fetch(req, server) {
    const url = new URL(req.url);

    // ── WebSocket upgrade ──────────────────────────────────────
    if (wsUpgradePaths.has(url.pathname)) {
      const token = url.searchParams.get("token");
      if (!token) {
        return new Response("Missing token", { status: 401 });
      }
      const userData = await verifyWsToken(token, config.jwtSecret);
      if (!userData) {
        return new Response("Invalid token", { status: 401 });
      }
      const upgraded = server.upgrade(req, { data: userData });
      if (!upgraded) {
        return new Response("WebSocket upgrade failed", { status: 500 });
      }
      return undefined as unknown as Response;
    }

    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": resolveAllowOrigin(req),
          "Access-Control-Allow-Headers": "Authorization, Content-Type",
          "Access-Control-Allow-Methods": CORS_METHODS,
          Vary: "Origin",
        },
      });
    }

    if (healthPaths.has(url.pathname)) {
      return json(
        { ok: true, app: config.appName, dbEnabled: config.enableDb },
        200,
        req,
      );
    }

    if (imageProxyPaths.has(url.pathname)) {
      if (req.method === "GET") return handleInboundImageProxy(req);
      return json({ error: "Method not allowed" }, 405, req);
    }

    if (openApiJsonPaths.has(url.pathname) && req.method === "GET") {
      return json(buildOpenApiDocument(req), 200, req);
    }
    if (swaggerUiPaths.has(url.pathname) && req.method === "GET") {
      return textResponse(
        renderSwaggerUiHtml("./openapi.json", `${config.appName} Swagger`),
        200,
        req,
        "text/html; charset=utf-8",
      );
    }

    if (authLoginPaths.has(url.pathname) && req.method === "POST") {
      return authLogin(req);
    }
    if (authMePaths.has(url.pathname) && req.method === "GET") {
      return authMe(req);
    }
    if (aiSettingsPaths.has(url.pathname)) {
      if (req.method === "GET") return handleAiSettingsGet(req);
      if (req.method === "PUT") return handleAiSettingsUpdate(req);
    }
    if (whatsappProfilePaths.has(url.pathname)) {
      if (req.method === "GET") return handleWhatsAppProfileGet(req);
      if (req.method === "PUT") return handleWhatsAppProfileUpdate(req);
    }
    if (instagramConnectionsPaths.has(url.pathname)) {
      if (req.method === "GET") return handleInstagramConnectionsGet(req);
      if (req.method === "POST") return handleInstagramConnectionsCreate(req);
    }
    if (instagramOauthStartPaths.has(url.pathname) && req.method === "GET") {
      return handleInstagramOauthStart(req);
    }
    if (instagramOauthCallbackPaths.has(url.pathname)) {
      if (req.method === "GET") return handleInstagramOauthCallback(req);
      if (req.method === "POST") return handleInstagramOauthCallbackPost(req);
    }
    const instagramConnectionSuffix = extractPathSuffix(
      url.pathname,
      instagramConnectionsPrefix,
    );
    if (instagramConnectionSuffix && req.method === "DELETE") {
      return handleInstagramConnectionDelete(req, instagramConnectionSuffix);
    }
    if (dashboardOverviewPaths.has(url.pathname) && req.method === "GET") {
      return dashboardOverview(req);
    }
    if (dashboardAlertsPaths.has(url.pathname) && req.method === "GET") {
      return dashboardAlerts(req);
    }
    if (dashboardConversationsPaths.has(url.pathname) && req.method === "GET") {
      return dashboardConversations(req);
    }
    if (dashboardCacheMetricsPaths.has(url.pathname) && req.method === "GET") {
      return dashboardCacheMetrics(req);
    }
    if (
      req.method === "GET" &&
      dashboardConversationTurnsPrefix.some((pathPrefix) =>
        url.pathname.startsWith(pathPrefix),
      )
    ) {
      return dashboardConversationTurns(req);
    }

    // ── Pipeline / Kanban routes ─────────────────────────────
    if (funnelMetricsPaths.has(url.pathname) && req.method === "GET") {
      return handleFunnelMetrics(req);
    }
    if (pipelineStagesReorderPaths.has(url.pathname) && req.method === "POST") {
      return handlePipelineStagesReorder(req);
    }
    if (pipelineStagesPaths.has(url.pathname)) {
      if (req.method === "GET") return handlePipelineStages(req);
      if (req.method === "POST") return handlePipelineStageCreate(req);
    }
    const pipelineStageSuffix = extractPathSuffix(url.pathname, pipelineStagesPrefix);
    if (pipelineStageSuffix) {
      const id = Number(pipelineStageSuffix);
      if (id) {
        if (req.method === "PUT") return handlePipelineStageUpdate(req, id);
        if (req.method === "DELETE") return handlePipelineStageDelete(req, id);
      }
    }
    if (pipelineBoardPaths.has(url.pathname) && req.method === "GET") {
      return handlePipelineBoard(req);
    }
    if (pipelineBoardColumnPaths.has(url.pathname) && req.method === "GET") {
      return handlePipelineBoardColumn(req);
    }
    if (contactsPaths.has(url.pathname) && req.method === "POST") {
      return handleContactCreate(req);
    }
    if (contactsBatchPaths.has(url.pathname) && req.method === "POST") {
      return handleContactsBatch(req);
    }

    // ── Contact-level routes (/contacts/:waId/...) ───────────
    const contactSuffix = extractPathSuffix(url.pathname, contactsPrefix);
    if (contactSuffix) {
      const parts = contactSuffix.split("/");
      const waId = parts[0];
      const action = parts[1];
      const subId = parts[2];

      if (action === "stage" && req.method === "PUT" && waId) {
        return handleContactStageUpdate(req, waId);
      }
      if (action === "status" && req.method === "PUT" && waId) {
        return handleContactStatusUpdate(req, waId);
      }
      if (action === "bot" && req.method === "PUT" && waId) {
        return handleContactBotToggle(req, waId);
      }
      if (action === "send" && req.method === "POST" && waId) {
        return handleContactSend(req, waId);
      }
      if (action === "tags" && req.method === "POST" && waId) {
        return handleContactTagAdd(req, waId);
      }
      if (action === "tags" && req.method === "DELETE" && waId && subId) {
        return handleContactTagRemove(req, waId, Number(subId));
      }
      if (action === "audit" && req.method === "GET" && waId) {
        return handleContactAuditLog(req, waId);
      }
      if (!action && req.method === "PUT" && waId) {
        return handleContactUpdate(req, waId);
      }
      if (!action && req.method === "DELETE" && waId) {
        return handleContactDelete(req, waId);
      }
    }

    // ── FAQ routes ───────────────────────────────────────────
    if (faqPaths.has(url.pathname)) {
      if (req.method === "GET") return handleFaqList(req);
      if (req.method === "POST") return handleFaqCreate(req);
    }
    const faqSuffix = extractPathSuffix(url.pathname, faqPrefix);
    if (faqSuffix) {
      const id = Number(faqSuffix);
      if (id) {
        if (req.method === "PUT") return handleFaqUpdate(req, id);
        if (req.method === "DELETE") return handleFaqDelete(req, id);
      }
    }

    // ── Template routes ──────────────────────────────────────
    if (templatePaths.has(url.pathname)) {
      if (req.method === "GET") return handleTemplateList(req);
      if (req.method === "POST") return handleTemplateCreate(req);
    }
    const templateSuffix = extractPathSuffix(url.pathname, templatePrefix);
    if (templateSuffix) {
      const id = Number(templateSuffix);
      if (id) {
        if (req.method === "PUT") return handleTemplateUpdate(req, id);
        if (req.method === "DELETE") return handleTemplateDelete(req, id);
      }
    }

    // ── Tag routes ───────────────────────────────────────────
    if (tagPaths.has(url.pathname)) {
      if (req.method === "GET") return handleTagList(req);
      if (req.method === "POST") return handleTagCreate(req);
    }
    const tagSuffix = extractPathSuffix(url.pathname, tagPrefix);
    if (tagSuffix) {
      const id = Number(tagSuffix);
      if (id && req.method === "PUT") return handleTagUpdate(req, id);
      if (id && req.method === "DELETE") return handleTagDelete(req, id);
    }

    // ── Audio routes ─────────────────────────────────────────
    if (audioPaths.has(url.pathname)) {
      if (req.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": resolveAllowOrigin(req),
            "Access-Control-Allow-Headers": "Authorization, Content-Type",
            "Access-Control-Allow-Methods": CORS_METHODS,
          },
        });
      }
      if (req.method === "GET") return handleAudioList(req);
      if (req.method === "POST") return handleAudioUpload(req);
    }
    const audioSuffix = extractPathSuffix(url.pathname, audioPrefix);
    if (audioSuffix) {
      // /audios/stream-url?url=<encoded> — look up audio by CDN URL
      if (audioSuffix === "stream-url") {
        if (req.method === "OPTIONS") {
          return new Response(null, {
            status: 204,
            headers: {
              "Access-Control-Allow-Origin": resolveAllowOrigin(req),
              "Access-Control-Allow-Headers": "Authorization, Content-Type",
              "Access-Control-Allow-Methods": "GET, OPTIONS",
            },
          });
        }
        if (req.method === "GET") return handleAudioStreamByUrl(req);
      }
      // /audios/:id/stream
      if (audioSuffix.endsWith("/stream")) {
        const id = Number(audioSuffix.replace("/stream", ""));
        if (id) {
          if (req.method === "OPTIONS") {
            return new Response(null, {
              status: 204,
              headers: {
                "Access-Control-Allow-Origin": resolveAllowOrigin(req),
                "Access-Control-Allow-Headers": "Authorization, Content-Type",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
              },
            });
          }
          if (req.method === "GET") return handleAudioStream(req, id);
        }
      } else {
        const id = Number(audioSuffix);
        if (id) {
          if (req.method === "OPTIONS") {
            return new Response(null, {
              status: 204,
              headers: {
                "Access-Control-Allow-Origin": resolveAllowOrigin(req),
                "Access-Control-Allow-Headers": "Authorization, Content-Type",
                "Access-Control-Allow-Methods": CORS_METHODS,
              },
            });
          }
          if (req.method === "PUT") return handleAudioUpdate(req, id);
          if (req.method === "DELETE") return handleAudioDelete(req, id);
        }
      }
    }

    // ── Task routes ──────────────────────────────────────────
    if (taskPaths.has(url.pathname)) {
      if (req.method === "GET") return handleTaskList(req);
      if (req.method === "POST") return handleTaskCreate(req);
    }
    if (rolesPaths.has(url.pathname)) {
      if (req.method === "GET") return handleRoleList(req);
      if (req.method === "POST") return handleRoleCreate(req);
    }
    if (usersPaths.has(url.pathname)) {
      if (req.method === "GET") return handleUserList(req);
      if (req.method === "POST") return handleUserCreate(req);
    }
    const roleSuffix = extractPathSuffix(url.pathname, rolesPrefix);
    if (roleSuffix) {
      if (req.method === "PUT") return handleRoleUpdate(req, roleSuffix);
      if (req.method === "DELETE") return handleRoleDelete(req, roleSuffix);
    }
    const userSuffix = extractPathSuffix(url.pathname, usersPrefix);
    if (userSuffix) {
      if (req.method === "DELETE") return handleUserDelete(req, userSuffix);
    }
    const taskSuffix = extractPathSuffix(url.pathname, taskPrefix);
    if (taskSuffix) {
      const id = Number(taskSuffix);
      if (id) {
        if (req.method === "PUT") return handleTaskUpdate(req, id);
        if (req.method === "DELETE") return handleTaskDelete(req, id);
      }
    }

    if (handoffQueuePaths.has(url.pathname) && req.method === "GET") {
      return handleHandoffQueueList(req);
    }

    // ── Reports routes ───────────────────────────────────────
    if (reportsPaths.has(url.pathname) && req.method === "GET") {
      return handleReportsLeads(req);
    }
    if (reportsPerformancePaths.has(url.pathname) && req.method === "GET") {
      return handleReportsPerformance(req);
    }
    if (reportsExportPaths.has(url.pathname) && req.method === "GET") {
      return handleReportsExport(req);
    }

    const handoffSuffix = extractPathSuffix(url.pathname, handoffQueuePrefix);
    if (handoffSuffix) {
      const parts = handoffSuffix.split("/");
      const waId = parts[0];
      const action = parts[1];
      if (waId && action === "assign" && req.method === "PUT") {
        return handleHandoffAssign(req, waId);
      }
    }

    const webhookRouteChannel = resolveWebhookRouteChannel(url.pathname);
    if (!webhookRouteChannel) {
      return textResponse("Not found", 404, req);
    }

    if (req.method === "GET") return webhookVerify(req, webhookRouteChannel);
    if (req.method === "POST") return webhookEvent(req, webhookRouteChannel);

    return textResponse("Method Not Allowed", 405, req);
  },

  websocket: {
    open(ws) {
      registerConnection(ws);
    },
    close(ws) {
      unregisterConnection(ws);
    },
    message(_ws, _message) {
      // Client-to-server messages not needed yet; reserved for future use
    },
  },
});

// Start the heartbeat timer
startHeartbeat(30_000);
void invalidateReplyCaches();
if (config.enableDb) {
  startAlertsBroadcast();
  startHandoffEscalation();
  startPendingAutoReplyRecovery();
}

const shutdown = (signal: string) => {
  console.log(`Received ${signal}, shutting down`);
  stopHeartbeat();
  stopAlertsBroadcast();
  stopHandoffEscalation();
  stopPendingAutoReplyRecovery();
  server.stop(true);
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

console.log(
  `Server running on http://localhost:${server.port}${config.apiBasePath} (webhooks: ${config.apiBasePath}/webhook/whatsapp, ${config.apiBasePath}/webhook/instagram)`,
);
