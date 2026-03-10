import { config } from "./config";
import {
  cacheDeleteByPrefix,
  cacheGetJson,
  cacheSetJson,
  getCacheMetrics,
} from "./lib/cache";
import { getPrismaClient } from "./lib/prisma";
import type { Prisma, PrismaClient } from "@prisma/client";
import { AuthService } from "./services/auth";
import type { PublicUser } from "./services/auth";
import { DashboardService } from "./services/dashboard";
import { OpenAIService } from "./services/openai";
import { extractInboundMessages, WhatsAppService } from "./services/whatsapp";
import type { InboundMessage, WhatsAppWebhookPayload } from "./types/whatsapp";
import {
  HANDOFF_CRITICAL_MINUTES,
  classifyHandoffSla,
  computeHandoffWaitMinutes,
} from "./lib/operationalAlerts";
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

const openAI = new OpenAIService(
  config.openaiApiKey,
  config.openaiModel,
  config.appName,
  config.openaiTranscriptionModel,
  config.assistantLanguage,
  config.assistantPersonality,
  config.assistantStyle,
  config.assistantSystemPrompt,
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
);

const CORS_METHODS = "GET,POST,PUT,DELETE,OPTIONS";

const json = (body: unknown, status = 200, req?: Request): Response => {
  const origin = req?.headers.get("origin");
  const allowOrigin =
    origin && (config.webOrigin === "*" || origin === config.webOrigin)
      ? origin
      : config.webOrigin;

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
  const origin = req?.headers.get("origin");
  const allowOrigin =
    origin && (config.webOrigin === "*" || origin === config.webOrigin)
      ? origin
      : config.webOrigin;

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
const webhookPaths = new Set<string>([
  `${config.apiBasePath}/webhook`,
  "/webhook",
]);
const authLoginPaths = new Set<string>([
  `${config.apiBasePath}/auth/login`,
  "/auth/login",
]);
const authMePaths = new Set<string>([
  `${config.apiBasePath}/auth/me`,
  "/auth/me",
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
const handoffQueuePaths = new Set<string>([
  `${config.apiBasePath}/handoff/queue`,
  "/handoff/queue",
]);
const handoffQueuePrefix = [
  `${config.apiBasePath}/handoff/queue/`,
  "/handoff/queue/",
];
const wsUpgradePaths = new Set<string>([
  `${config.apiBasePath}/ws`,
  "/ws",
]);

const processedMessageIds = new Map<string, number>();
const MESSAGE_ID_TTL_MS = 10 * 60 * 1000;
const HUMAN_HANDOFF_REGEX =
  /\b(atendente|humano|pessoa real|suporte humano|falar com alguem|falar com pessoa|time de atendimento)\b/i;

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

const tryFaqFeedbackCache = async (
  userMessage: string,
): Promise<string | null> => {
  const key = normalizeFaqKey(userMessage);
  if (!key) return null;
  return cacheGetJson<string>(`${FAQ_FEEDBACK_CACHE_PREFIX}${key}`);
};

const saveFaqFeedbackCache = async (
  userMessage: string,
  aiReply: string,
): Promise<void> => {
  const key = normalizeFaqKey(userMessage);
  if (!key) return;
  await cacheSetJson(`${FAQ_FEEDBACK_CACHE_PREFIX}${key}`, aiReply, FAQ_FEEDBACK_TTL_SECONDS);
};

// ── Handoff Escalation: auto-check stale handoffs and send WhatsApp follow-up ──
const HANDOFF_ESCALATION_INTERVAL_MS = 60_000; // check every 60s
const HANDOFF_ESCALATION_WARN_MINUTES = 15;
let handoffEscalationInterval: ReturnType<typeof setInterval> | null = null;

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
        handoffRequested: true,
        botEnabled: false,
        handoffAt: {
          not: null,
          lte: warnThreshold,
        },
      },
      select: {
        id: true,
        waId: true,
        name: true,
        handoffAt: true,
        messages: {
          where: { direction: "out" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true, body: true },
        },
      },
    });

    for (const contact of staleHandoffs) {
      const lastOut = contact.messages[0];
      // Only escalate if the last outbound message was BEFORE handleoff (= no human replied)
      const lastOutTime = lastOut?.createdAt?.getTime() ?? 0;
      const handoffTime = contact.handoffAt?.getTime() ?? 0;

      // Skip if a human already replied after handoff
      if (lastOutTime > handoffTime) continue;

      // Skip if we already sent an escalation follow-up (check body pattern)
      if (lastOut?.body?.includes("ainda estamos buscando")) continue;

      const waitMin = Math.floor((Date.now() - handoffTime) / 60_000);
      const followUp = `Oi${contact.name ? ` ${contact.name}` : ""}, ainda estamos buscando um atendente para voce. Tempo de espera: ${waitMin} min. Obrigado pela paciencia!`;

      try {
        await whatsapp.sendTextMessage(contact.waId, followUp);
        await persistTurn(contact.waId, "assistant", followUp);
        broadcast("message:new", {
          phone: contact.waId,
          role: "assistant",
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

const VALID_LEAD_STATUS = new Set(["open", "won", "lost"]);
const VALID_TASK_STATUS = new Set(["open", "in_progress", "done", "cancelled"]);
const VALID_TASK_PRIORITY = new Set(["low", "medium", "high", "urgent"]);
const ALERTS_BROADCAST_INTERVAL_MS = 20_000;
const handoffAssignments = new Map<string, { owner: string; assignedAt: number }>();
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
      where: { handoffRequested: true },
    }),
    prisma.contact.count({
      where: {
        handoffRequested: true,
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

    const suggestion = await openAI.suggestFaqEntry(userMessage, aiReply);
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



const resolveInboundText = async (message: InboundMessage): Promise<string> => {
  if (message.type === "text") {
    return message.text;
  }

  const media = await whatsapp.downloadMedia(message.mediaId, message.mimeType);
  return openAI.transcribeAudio(media);
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
  phone: string,
  role: "user" | "assistant",
  content: string,
  externalMessageId?: string,
  contactName?: string,
): Promise<void> => {
  const prisma = await getPrismaClient();
  if (!prisma) return;

  try {
    const contact = await prisma.contact.upsert({
      where: { waId: phone },
      update: {
        lastInteractionAt: new Date(),
      },
      create: {
        waId: phone,
        name: contactName || null,
        lastInteractionAt: new Date(),
      },
    });

    if (
      contactName &&
      contactName.trim() &&
      (contact.name ?? "").trim().toLowerCase() !== contactName.trim().toLowerCase()
    ) {
      await prisma.contact.update({
        where: { id: contact.id },
        data: { name: contactName.trim() },
      });
    }

    const direction = role === "user" ? "in" : "out";
    const waMessageId = direction === "in" ? externalMessageId : undefined;

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
        body: content,
        waMessageId,
      },
    });
    void invalidateDashboardCaches();
  } catch (error) {
    console.error(`[phone:${phone}] failed to persist ${role} turn`, error);
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

const webhookVerify = (req: Request): Response => {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode !== "subscribe" || token !== config.webhookVerifyToken || !challenge) {
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

const requireAdmin = (
  current: { user: PublicUser },
  req: Request,
): Response | null => {
  if (current.user.role !== "ADMIN") {
    return json({ error: "Forbidden: admin only" }, 403, req);
  }
  return null;
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

const dashboardOverview = async (req: Request): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;

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
    500,
    Math.max(1, Number.isFinite(Number(limitParam)) ? Number(limitParam) : 200),
  );

  const turns = await dashboard.getConversationTurns(current.prisma, phone, limit);
  return json(turns, 200, req);
};

const dashboardCacheMetrics = async (req: Request): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;

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

const webhookEvent = async (req: Request): Promise<Response> => {
  let payload: WhatsAppWebhookPayload;

  try {
    payload = (await req.json()) as WhatsAppWebhookPayload;
  } catch {
    return json({ error: "Invalid JSON payload" }, 400);
  }

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
        try {
          await whatsapp.markAsRead(message.messageId);
        } catch (error) {
          console.warn(
            `[message:${message.messageId}] could not mark as read`,
            error,
          );
        }

        const userText = (await resolveInboundText(message)).trim();
        if (!userText) {
          await whatsapp.sendTextMessage(
            message.from,
            "Nao consegui entender o audio. Pode enviar novamente ou mandar em texto?",
          );
          continue;
        }

        await persistTurn(
          message.from,
          "user",
          userText,
          message.messageId,
          message.contactName,
        );

        // Emit WS events: new user message + AI processing
        broadcast("message:new", { phone: message.from, role: "user", content: userText });
        broadcast("ai:processing", { phone: message.from });
        broadcast("notification", {
          phone: message.from,
          name: message.contactName ?? null,
          messageId: message.messageId,
          preview: userText.slice(0, 120),
        });

        const prisma = await getPrismaClient();
        let aiReply: string;

        // FAQ Feedback Loop: check cache for repeated question
        const cachedReply = await tryFaqFeedbackCache(userText);
        if (cachedReply && prisma) {
          const latestContact = await prisma.contact.findUnique({
            where: { waId: message.from },
            select: { botEnabled: true },
          });
          if (latestContact && latestContact.botEnabled) {
            await sleep(computeReplyDelayMs(userText));
            await whatsapp.sendTextMessage(message.from, cachedReply);
            await persistTurn(message.from, "assistant", cachedReply);
            broadcast("message:new", { phone: message.from, role: "assistant", content: cachedReply });
            broadcast("ai:done", { phone: message.from });
            console.log(`[faq-feedback] served cached reply to ${message.from}`);
            continue;
          }
        }

        if (prisma) {
          let contact = await prisma.contact.findUnique({ where: { waId: message.from } });
          if (contact && !contact.botEnabled) {
            broadcast("ai:done", { phone: message.from });
            continue;
          }

          let extraction: Awaited<ReturnType<OpenAIService["extractLeadData"]>> = {};
          try {
            extraction = await openAI.extractLeadData(userText);
          } catch (error) {
            console.warn(`[phone:${message.from}] extraction failed`, error);
          }

          const wantsHuman =
            extraction.wantsHuman === true || HUMAN_HANDOFF_REGEX.test(userText);

          const updateData = buildContactUpdateFromExtraction(extraction);
          if (wantsHuman) {
            updateData.botEnabled = false;
            updateData.handoffRequested = true;
            updateData.handoffAt = new Date();
            updateData.handoffReason =
              extraction.handoffReason ?? "Pedido explicito de atendimento humano";
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
          }

          if (wantsHuman) {
            const handoffReply =
              "Perfeito, vou encaminhar voce para o atendimento humano agora. Enquanto isso, se quiser, me diga campeonato e cidade para agilizar.";
            await sleep(computeReplyDelayMs(handoffReply));
            await whatsapp.sendTextMessage(message.from, handoffReply);
            await persistTurn(message.from, "assistant", handoffReply);
            broadcast("message:new", {
              phone: message.from,
              role: "assistant",
              content: handoffReply,
            });
            broadcast("ai:done", { phone: message.from });
            continue;
          }

          aiReply = await openAI.generateReply(userText, prisma, message.from, {
            triageMissing: missingFields,
          });
        } else {
          aiReply = await openAI.generateReply(userText);
        }

        await sleep(computeReplyDelayMs(userText));

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

        await whatsapp.sendTextMessage(message.from, aiReply);
        await persistTurn(message.from, "assistant", aiReply);

        // Emit WS events: AI reply + done + updated overview
        broadcast("message:new", { phone: message.from, role: "assistant", content: aiReply });
        broadcast("ai:done", { phone: message.from });

        if (prisma) {
          const overview = await dashboard.getOverview(prisma);
          broadcast("overview:updated", overview as unknown as Record<string, unknown>);
          // Fire-and-forget: auto-add FAQ if this question was asked by multiple contacts
          void tryAutoFaq(prisma, message.from, userText, aiReply);
          // Cache the reply for the FAQ feedback loop (24h)
          void saveFaqFeedbackCache(userText, aiReply);
        }
      } catch (error) {
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

const handlePipelineStages = async (req: Request): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;

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
  const denied = requireAdmin(current, req);
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
  const denied = requireAdmin(current, req);
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
  const denied = requireAdmin(current, req);
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
  const denied = requireAdmin(current, req);
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

  await current.prisma.$transaction(
    uniqueStageIds.map((id, index) =>
      current.prisma.pipelineStage.update({
        where: { id },
        data: { position: index + 1 },
      }),
    ),
  );

  broadcast("pipeline:updated", { action: "stage:reordered" });
  void invalidateDashboardCaches();
  return json({ ok: true }, 200, req);
};

const handlePipelineBoard = async (req: Request): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;

  const url = new URL(req.url);
  const contactLimitParam = Number(url.searchParams.get("contactLimit"));
  const contactLimit = Number.isInteger(contactLimitParam)
    ? Math.min(100, Math.max(5, contactLimitParam))
    : 50;

  const cacheKey = `${DASHBOARD_CACHE_PREFIX}pipeline:board:${contactLimit}`;
  const cached = await cacheGetJson<{ stages: unknown[]; unassigned: unknown[] }>(cacheKey);
  if (cached) {
    return json(cached, 200, req);
  }

  const stages = await current.prisma.pipelineStage.findMany({
    orderBy: { position: "asc" },
    include: {
      contacts: {
        include: {
          tags: { include: { tag: true } },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { body: true, createdAt: true },
          },
        },
        orderBy: { lastInteractionAt: "desc" },
        take: contactLimit,
      },
    },
  });

  // Include unassigned contacts (no stage)
  const unassigned = await current.prisma.contact.findMany({
    where: { stageId: null },
    include: {
      tags: { include: { tag: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, createdAt: true },
      },
    },
    orderBy: { lastInteractionAt: "desc" },
    take: contactLimit,
  });

  const payload = { stages, unassigned };
  void cacheSetJson(cacheKey, payload, PIPELINE_CACHE_TTL_SECONDS);
  return json(payload, 200, req);
};

const handleContactCreate = async (req: Request): Promise<Response> => {
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

  const waId = typeof input.waId === "string" ? input.waId.trim() : "";
  if (!waId) {
    return json({ error: "waId is required" }, 400, req);
  }

  const data: Prisma.ContactUncheckedCreateInput = {
    waId,
    leadStatus: "open",
    triageCompleted: false,
    handoffRequested: false,
    handoffAt: null,
    handoffReason: null,
    botEnabled: true,
  };

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
  data.handoffRequested = finalHandoffRequested;
  if (finalHandoffRequested) {
    data.handoffAt = handoffAt ?? new Date();
    if (handoffReason !== undefined) {
      data.handoffReason = handoffReason;
    } else if (!botEnabled) {
      data.handoffReason = "Bot desativado manualmente no cadastro";
    }
  } else {
    data.handoffAt = null;
    data.handoffReason = null;
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
  const denied = requireAdmin(current, req);
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
  const isAdmin = current.user.role === "ADMIN";

  if (!isAdmin && (hasOwn(input, "leadStatus") || hasOwn(input, "stageId"))) {
    return json({ error: "Forbidden: admin only" }, 403, req);
  }

  const existing = await current.prisma.contact.findUnique({
    where: { waId },
    select: {
      id: true,
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

  if (typeof input.handoffRequested === "boolean") {
    data.handoffRequested = input.handoffRequested;
    if (input.handoffRequested) {
      if (!hasOwn(input, "handoffAt")) {
        data.handoffAt = new Date();
      }
    } else {
      if (!hasOwn(input, "handoffAt")) {
        data.handoffAt = null;
      }
      if (!hasOwn(input, "handoffReason")) {
        data.handoffReason = null;
      }
    }
  }
  if (hasOwn(input, "handoffReason")) {
    const value = normalizeNullableText(input.handoffReason);
    if (value !== undefined) data.handoffReason = value;
  }
  if (hasOwn(input, "handoffAt")) {
    const parsed = parseDateInput(input.handoffAt);
    if (parsed === undefined) {
      return json({ error: "handoffAt must be a valid date string or null" }, 400, req);
    }
    data.handoffAt = parsed;
  }

  if (typeof input.botEnabled === "boolean") {
    data.botEnabled = input.botEnabled;
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
  if (!contact.handoffRequested) {
    handoffAssignments.delete(contact.waId);
  }

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
  return json(contact, 200, req);
};

const handleContactStatusUpdate = async (
  req: Request,
  waId: string,
): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;
  const denied = requireAdmin(current, req);
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
  const denied = requireAdmin(current, req);
  if (denied) return denied;

  try {
    await current.prisma.contact.delete({ where: { waId } });
  } catch {
    return json({ error: "Contact not found" }, 404, req);
  }
  handoffAssignments.delete(waId);

  broadcast("contact:deleted", { waId });
  void invalidateDashboardCaches();
  return json({ ok: true }, 200, req);
};

// ── Batch actions on contacts ────────────────────────────────
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
    const denied = requireAdmin(current, req);
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
    const botEnabled = input.botEnabled === true;
    const result = await current.prisma.contact.updateMany({
      where: { waId: { in: waIds } },
      data: { botEnabled },
    });
    updated = result.count;
  } else if (action === "requestHandoff") {
    const result = await current.prisma.contact.updateMany({
      where: { waId: { in: waIds } },
      data: {
        handoffRequested: true,
        handoffAt: new Date(),
        handoffReason: "Solicitação em lote via painel",
        botEnabled: false,
      },
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

  const data: Prisma.ContactUncheckedUpdateInput = { botEnabled };
  if (!botEnabled) {
    data.handoffRequested = true;
    data.handoffAt = new Date();
    data.handoffReason = "Bot desativado manualmente no painel";
  }

  let contact;
  try {
    contact = await current.prisma.contact.update({
      where: { waId },
      data,
    });
  } catch {
    return json({ error: "Contact not found" }, 404, req);
  }

  broadcast("contact:updated", { waId, botEnabled });
  void invalidateDashboardCaches();
  return json(contact, 200, req);
};

const handleContactSend = async (
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

  const input = body as Record<string, unknown>;
  const message = typeof input.message === "string" ? input.message.trim() : "";
  if (!message) {
    return json({ error: "message is required" }, 400, req);
  }

  await whatsapp.sendTextMessage(waId, message);
  await persistTurn(waId, "assistant", message);

  broadcast("message:sent", { phone: waId, role: "assistant", content: message, sentBy: current.user.email });
  broadcast("message:new", { phone: waId, role: "assistant", content: message });

  return json({ ok: true }, 200, req);
};

// ── Phase 2: FAQ endpoints ─────────────────────────────────────────

const handleFaqList = async (req: Request): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;

  const url = new URL(req.url);
  const limit = Math.min(
    100,
    Math.max(1, Number(url.searchParams.get("limit") ?? "50") || 50),
  );
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? "0") || 0);
  const search = url.searchParams.get("search")?.trim();
  const isActiveParam = url.searchParams.get("isActive");

  const where: Prisma.FaqWhereInput = {};
  if (search) {
    where.OR = [
      { question: { contains: search, mode: "insensitive" } },
      { answer: { contains: search, mode: "insensitive" } },
    ];
  }
  if (isActiveParam === "true") where.isActive = true;
  if (isActiveParam === "false") where.isActive = false;

  const [items, total] = await Promise.all([
    current.prisma.faq.findMany({ where, orderBy: { createdAt: "desc" }, skip: offset, take: limit }),
    current.prisma.faq.count({ where }),
  ]);

  return json({ items, total, limit, offset }, 200, req);
};

const handleFaqCreate = async (req: Request): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, req);
  }

  const input = body as Record<string, unknown>;
  const question = typeof input.question === "string" ? input.question.trim() : "";
  const answer = typeof input.answer === "string" ? input.answer.trim() : "";
  if (!question || !answer) {
    return json({ error: "question and answer are required" }, 400, req);
  }

  const faq = await current.prisma.faq.create({
    data: {
      question,
      answer,
      isActive: input.isActive !== false,
    },
  });
  return json(faq, 201, req);
};

const handleFaqUpdate = async (req: Request, id: number): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, req);
  }

  const input = body as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  if (typeof input.question === "string") data.question = input.question.trim();
  if (typeof input.answer === "string") data.answer = input.answer.trim();
  if (typeof input.isActive === "boolean") data.isActive = input.isActive;

  const faq = await current.prisma.faq.update({ where: { id }, data });
  return json(faq, 200, req);
};

const handleFaqDelete = async (req: Request, id: number): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;

  await current.prisma.faq.delete({ where: { id } });
  return json({ ok: true }, 200, req);
};

// ── Phase 2: Template endpoints ────────────────────────────────────

const handleTemplateList = async (req: Request): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;

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

  await current.prisma.messageTemplate.delete({ where: { id } });
  return json({ ok: true }, 200, req);
};

// ── Phase 2: Tag endpoints ─────────────────────────────────────────

const handleTagList = async (req: Request): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;

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

  await current.prisma.tag.delete({ where: { id } });
  void invalidateDashboardCaches();
  return json({ ok: true }, 200, req);
};

const handleTagUpdate = async (req: Request, id: number): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;

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

  const url = new URL(req.url);
  const onlyMineParam = url.searchParams.get("onlyMine");
  const onlyMine = onlyMineParam === "1" || onlyMineParam === "true";
  const now = new Date();

  const contacts = await current.prisma.contact.findMany({
    where: { handoffRequested: true },
    include: {
      stage: {
        select: {
          id: true,
          name: true,
          color: true,
        },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, createdAt: true },
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
      const startedAt = contact.handoffAt ?? contact.lastInteractionAt ?? contact.createdAt;
      const waitMinutes = computeHandoffWaitMinutes(startedAt, now);
      const slaLevel = classifyHandoffSla(waitMinutes);
      const assignment = handoffAssignments.get(contact.waId);
      return {
        waId: contact.waId,
        name: contact.name,
        stage: contact.stage,
        handoffReason: contact.handoffReason,
        handoffAt: contact.handoffAt,
        waitMinutes,
        slaLevel,
        assignedTo: assignment?.owner ?? null,
        assignedAt: assignment ? new Date(assignment.assignedAt).toISOString() : null,
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

  // Cleanup assignments for contacts no longer in queue
  const queueWaIds = new Set(queue.map((item) => item.waId));
  for (const waId of handoffAssignments.keys()) {
    if (!queueWaIds.has(waId)) {
      handoffAssignments.delete(waId);
    }
  }

  return json(queue, 200, req);
};

const handleHandoffAssign = async (
  req: Request,
  waId: string,
): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;

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
    select: { waId: true, handoffRequested: true },
  });
  if (!contact) return json({ error: "Contact not found" }, 404, req);
  if (!contact.handoffRequested) {
    return json({ error: "Contact is not in human handoff queue" }, 400, req);
  }

  if (ownerRaw === null) {
    handoffAssignments.delete(waId);
  } else {
    const owner = ownerRaw && ownerRaw.length > 0 ? ownerRaw : current.user.email;
    handoffAssignments.set(waId, { owner, assignedAt: Date.now() });
  }

  const assignment = handoffAssignments.get(waId);
  const payload = {
    waId,
    assignedTo: assignment?.owner ?? null,
    assignedAt: assignment ? new Date(assignment.assignedAt).toISOString() : null,
  };

  broadcast("handoff:updated", payload as unknown as Record<string, unknown>);
  void invalidateDashboardCaches();
  return json(payload, 200, req);
};

const handleTaskList = async (req: Request): Promise<Response> => {
  const current = await getAuthenticatedUser(req);
  if (current instanceof Response) return current;

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

// ── Helper: parse suffix from a matching prefix list ───────────────

const extractPathSuffix = (pathname: string, prefixes: string[]): string | null => {
  for (const prefix of prefixes) {
    if (pathname.startsWith(prefix)) {
      return decodeURIComponent(pathname.slice(prefix.length));
    }
  }
  return null;
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
          "Access-Control-Allow-Origin": config.webOrigin,
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

    if (authLoginPaths.has(url.pathname) && req.method === "POST") {
      return authLogin(req);
    }
    if (authMePaths.has(url.pathname) && req.method === "GET") {
      return authMe(req);
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

    // ── Webhook routes ───────────────────────────────────────
    if (taskPaths.has(url.pathname)) {
      if (req.method === "GET") return handleTaskList(req);
      if (req.method === "POST") return handleTaskCreate(req);
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
    const handoffSuffix = extractPathSuffix(url.pathname, handoffQueuePrefix);
    if (handoffSuffix) {
      const parts = handoffSuffix.split("/");
      const waId = parts[0];
      const action = parts[1];
      if (waId && action === "assign" && req.method === "PUT") {
        return handleHandoffAssign(req, waId);
      }
    }

    if (!webhookPaths.has(url.pathname)) {
      return textResponse("Not found", 404, req);
    }

    if (req.method === "GET") return webhookVerify(req);
    if (req.method === "POST") return webhookEvent(req);

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
if (config.enableDb) {
  startAlertsBroadcast();
  startHandoffEscalation();
}

const shutdown = (signal: string) => {
  console.log(`Received ${signal}, shutting down`);
  stopHeartbeat();
  stopAlertsBroadcast();
  stopHandoffEscalation();
  server.stop(true);
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

console.log(
  `Server running on http://localhost:${server.port}${config.apiBasePath} (webhook: ${config.apiBasePath}/webhook)`,
);
