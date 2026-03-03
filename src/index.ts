import { config } from "./config";
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

const whatsapp = new WhatsAppService(
  config.whatsappToken,
  config.whatsappPhoneNumberId,
  config.whatsappGraphVersion,
);

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const healthPaths = new Set<string>([
  `${config.apiBasePath}/health`,
  "/health",
  "/",
]);
const webhookPaths = new Set<string>([
  `${config.apiBasePath}/webhook`,
  "/webhook",
]);

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

        const aiReply = await openAI.generateReply(userText);
        await sleep(computeReplyDelayMs(userText));
        await whatsapp.sendTextMessage(message.from, aiReply);
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

const server = Bun.serve({
  port: config.apiPort,
  async fetch(req) {
    const url = new URL(req.url);

    if (healthPaths.has(url.pathname)) {
      return json({ ok: true, app: config.appName, dbEnabled: config.enableDb });
    }

    if (!webhookPaths.has(url.pathname)) {
      return new Response("Not found", { status: 404 });
    }

    if (req.method === "GET") return webhookVerify(req);
    if (req.method === "POST") return webhookEvent(req);

    return new Response("Method Not Allowed", { status: 405 });
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
