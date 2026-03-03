import { config } from "./config";
import { getPrismaClient } from "./lib/prisma";
import type { PrismaClient } from "@prisma/client";
import { AuthService } from "./services/auth";
import type { PublicUser } from "./services/auth";
import { DashboardService } from "./services/dashboard";
import { OpenAIService } from "./services/openai";
import { extractInboundMessages, WhatsAppService } from "./services/whatsapp";
import type { InboundMessage, WhatsAppWebhookPayload } from "./types/whatsapp";

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

const whatsapp = new WhatsAppService(
  config.whatsappToken,
  config.whatsappPhoneNumberId,
  config.whatsappGraphVersion,
);

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
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
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
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
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
const dashboardConversationsPaths = new Set<string>([
  `${config.apiBasePath}/dashboard/conversations`,
  "/dashboard/conversations",
]);
const dashboardConversationTurnsPrefix = [
  `${config.apiBasePath}/dashboard/conversations/`,
  "/dashboard/conversations/",
];

const processedMessageIds = new Map<string, number>();
const MESSAGE_ID_TTL_MS = 10 * 60 * 1000;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const computeReplyDelayMs = (text: string): number => {
  const proportionalDelay = Math.round(text.length * config.replyDelayPerCharMs);
  return Math.min(
    config.replyDelayMaxMs,
    Math.max(config.replyDelayMinMs, proportionalDelay),
  );
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
        lastInteractionAt: new Date(),
      },
    });

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

  const overview = await dashboard.getOverview(current.prisma);
  return json(overview, 200, req);
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

  const conversations = await dashboard.getConversations(current.prisma, limit);
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

const webhookEvent = async (req: Request): Promise<Response> => {
  let payload: WhatsAppWebhookPayload;

  try {
    payload = (await req.json()) as WhatsAppWebhookPayload;
  } catch {
    return json({ error: "Invalid JSON payload" }, 400);
  }

  const inbound = extractInboundMessages(payload);

  void (async () => {
    for (const message of inbound) {
      if (!shouldProcessMessage(message.messageId)) {
        continue;
      }

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

        await persistTurn(message.from, "user", userText, message.messageId);

        const aiReply = await openAI.generateReply(userText);
        await sleep(computeReplyDelayMs(userText));
        await whatsapp.sendTextMessage(message.from, aiReply);
        await persistTurn(message.from, "assistant", aiReply);
      } catch (error) {
        console.error(
          `[message:${message.messageId}] failed processing from ${message.from}`,
          error,
        );
      }
    }
  })();

  return new Response("EVENT_RECEIVED", { status: 200 });
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

const server = Bun.serve({
  port: config.apiPort,
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": config.webOrigin,
          "Access-Control-Allow-Headers": "Authorization, Content-Type",
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
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
    if (dashboardConversationsPaths.has(url.pathname) && req.method === "GET") {
      return dashboardConversations(req);
    }
    if (
      req.method === "GET" &&
      dashboardConversationTurnsPrefix.some((pathPrefix) =>
        url.pathname.startsWith(pathPrefix),
      )
    ) {
      return dashboardConversationTurns(req);
    }

    if (!webhookPaths.has(url.pathname)) {
      return textResponse("Not found", 404, req);
    }

    if (req.method === "GET") return webhookVerify(req);
    if (req.method === "POST") return webhookEvent(req);

    return textResponse("Method Not Allowed", 405, req);
  },
});

const shutdown = (signal: string) => {
  console.log(`Received ${signal}, shutting down`);
  server.stop(true);
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

console.log(
  `Server running on http://localhost:${server.port}${config.apiBasePath} (webhook: ${config.apiBasePath}/webhook)`,
);
