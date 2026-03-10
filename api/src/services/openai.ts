interface OpenAIOutputItem {
  type?: string;
  content?: Array<{
    type?: string;
    text?: string;
  }>;
}

interface OpenAIResponseBody {
  output_text?: string;
  output?: OpenAIOutputItem[];
}

interface OpenAITranscriptionBody {
  text?: string;
}

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: Array<{ type: string; text: string }>;
}

export interface LeadExtraction {
  name?: string;
  email?: string;
  tournament?: string;
  eventDate?: string;
  category?: string;
  city?: string;
  teamName?: string;
  playersCount?: number;
  wantsHuman?: boolean;
  handoffReason?: string;
}

const allowedExtractionKeys = new Set<keyof LeadExtraction>([
  "name",
  "email",
  "tournament",
  "eventDate",
  "category",
  "city",
  "teamName",
  "playersCount",
  "wantsHuman",
  "handoffReason",
]);

const MAX_WHATSAPP_TEXT_SIZE = 3500;
const CONTEXT_MESSAGE_LIMIT = 20;
const SUMMARY_TRIGGER_COUNT = 40;

const trimForWhatsApp = (text: string): string => {
  if (text.length <= MAX_WHATSAPP_TEXT_SIZE) return text;
  return `${text.slice(0, MAX_WHATSAPP_TEXT_SIZE - 1)}...`;
};

const extractFirstJsonObject = (raw: string): Record<string, unknown> | null => {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fallback below
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    const sliced = trimmed.slice(start, end + 1);
    const parsed = JSON.parse(sliced) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  return null;
};

const normalizeExtraction = (payload: Record<string, unknown>): LeadExtraction => {
  const result: LeadExtraction = {};

  for (const [key, value] of Object.entries(payload)) {
    if (!allowedExtractionKeys.has(key as keyof LeadExtraction)) continue;

    if (key === "playersCount") {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed > 0) {
        result.playersCount = Math.round(parsed);
      }
      continue;
    }

    if (key === "wantsHuman") {
      result.wantsHuman = value === true;
      continue;
    }

    if (typeof value !== "string") continue;
    const normalized = value.trim();
    if (!normalized) continue;

    if (key === "email") {
      const email = normalized.toLowerCase();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        result.email = email;
      }
      continue;
    }

    (result as Record<string, unknown>)[key] = normalized;
  }

  return result;
};

const safeParseText = (payload: OpenAIResponseBody): string => {
  if (payload.output_text?.trim()) {
    return payload.output_text.trim();
  }

  const parts: string[] = [];
  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text) {
        parts.push(content.text);
      }
    }
  }

  return parts.join("\n").trim();
};

export class OpenAIService {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly appName: string,
    private readonly transcriptionModel: string,
    private readonly assistantLanguage: string,
    private readonly assistantPersonality: string,
    private readonly assistantStyle: string,
    private readonly assistantSystemPrompt?: string,
  ) {}

  private buildSystemPrompt(extras?: {
    faqs?: string;
    contactInfo?: string;
    aiSummary?: string;
    triageMissing?: string[];
  }): string {
    const sections: string[] = [];

    if (this.assistantSystemPrompt) {
      sections.push(this.assistantSystemPrompt);
    } else {
      sections.push(
        [
          `Voce e ${this.appName}, uma assistente de WhatsApp para atendimento de campeonatos de esports.`,
          `Idioma principal: ${this.assistantLanguage}.`,
          `Personalidade: ${this.assistantPersonality}.`,
          `Estilo de resposta: ${this.assistantStyle}.`,
          "Regras de comportamento:",
          "- Seja clara, rapida e util.",
          "- Faca perguntas objetivas quando faltar contexto.",
          "- Evite texto longo e sem acao.",
          "- Nao invente informacoes.",
          "- Priorize triagem de lead para campeonato: nome, campeonato, data, categoria, cidade e time ou quantidade de jogadores.",
          "- E-mail e opcional: so solicite se fizer sentido, sem travar o atendimento.",
          "- Se o usuario pedir humano, confirme o encaminhamento e nao insista na automacao.",
        ].join("\n"),
      );
    }

    if (extras?.contactInfo) {
      sections.push(`\n--- Informacoes do contato ---\n${extras.contactInfo}`);
    }

    if (extras?.aiSummary) {
      sections.push(`\n--- Resumo da conversa ate agora ---\n${extras.aiSummary}`);
    }

    if (extras?.faqs) {
      sections.push(
        `\n--- Perguntas frequentes (use como base ao responder) ---\n${extras.faqs}`,
      );
    }

    if (extras?.triageMissing?.length) {
      sections.push(
        [
          "\n--- Campos de triagem ainda faltando ---",
          extras.triageMissing.map((item) => `- ${item}`).join("\n"),
          "Pergunte apenas o necessario para fechar os campos faltantes, sem repetir o que ja foi informado.",
        ].join("\n"),
      );
    }

    return sections.join("\n");
  }

  async transcribeAudio(audio: {
    arrayBuffer: ArrayBuffer;
    mimeType: string;
    fileName: string;
  }): Promise<string> {
    const formData = new FormData();
    const file = new File([audio.arrayBuffer], audio.fileName, {
      type: audio.mimeType,
    });

    formData.set("file", file);
    formData.set("model", this.transcriptionModel);

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(
        `OpenAI transcription failed (${response.status}): ${details || "no details"}`,
      );
    }

    const payload = (await response.json()) as OpenAITranscriptionBody;
    return payload.text?.trim() ?? "";
  }

  /**
   * Generate a reply for the given user message.
   * When a PrismaClient and phone are provided, loads multi-turn history,
   * contact info, AI summary, and active FAQs for richer context.
   */
  async generateReply(
    userMessage: string,
    prisma?: import("@prisma/client").PrismaClient,
    phone?: string,
    options?: { triageMissing?: string[] },
  ): Promise<string> {
    let historyMessages: ChatMessage[] = [];
    let extras: {
      faqs?: string;
      contactInfo?: string;
      aiSummary?: string;
      triageMissing?: string[];
    } = {};
    if (options?.triageMissing?.length) {
      extras = { ...extras, triageMissing: options.triageMissing };
    }

    if (prisma && phone) {
      // Load contact info for personalization
      const contact = await prisma.contact.findUnique({
        where: { waId: phone },
        include: {
          stage: true,
          tags: { include: { tag: true } },
        },
      });

      if (contact) {
        const parts: string[] = [];
        if (contact.name) parts.push(`Nome: ${contact.name}`);
        if (contact.age) parts.push(`Idade: ${contact.age}`);
        if (contact.level) parts.push(`Nivel: ${contact.level}`);
        if (contact.objective) parts.push(`Objetivo: ${contact.objective}`);
        if (contact.stage) parts.push(`Estagio no pipeline: ${contact.stage.name}`);
        if (contact.tags.length) {
          parts.push(`Tags: ${contact.tags.map((ct) => ct.tag.name).join(", ")}`);
        }
        if (contact.email) parts.push(`Email: ${contact.email}`);
        if (contact.tournament) parts.push(`Campeonato: ${contact.tournament}`);
        if (contact.eventDate) parts.push(`Data do campeonato: ${contact.eventDate}`);
        if (contact.category) parts.push(`Categoria: ${contact.category}`);
        if (contact.city) parts.push(`Cidade: ${contact.city}`);
        if (contact.teamName) parts.push(`Time: ${contact.teamName}`);
        if (typeof contact.playersCount === "number") {
          parts.push(`Quantidade de jogadores: ${contact.playersCount}`);
        }
        if (parts.length) extras.contactInfo = parts.join("\n");
        if (contact.aiSummary) extras.aiSummary = contact.aiSummary;
      }

      // Load active FAQs
      const faqs = await prisma.faq.findMany({
        where: { isActive: true },
        select: { question: true, answer: true },
      });
      if (faqs.length) {
        extras.faqs = faqs
          .map((f) => `P: ${f.question}\nR: ${f.answer}`)
          .join("\n\n");
      }

      // Load recent conversation history
      if (contact) {
        const recentMessages = await prisma.message.findMany({
          where: { contactId: contact.id },
          orderBy: { createdAt: "desc" },
          take: CONTEXT_MESSAGE_LIMIT,
          select: { direction: true, body: true },
        });

        // Reverse to chronological order, exclude last user message (we add it ourselves)
        historyMessages = recentMessages
          .reverse()
          .slice(0, -1) // drop the latest (current user message already persisted)
          .map((m) => ({
            role: (m.direction === "in" ? "user" : "assistant") as "user" | "assistant",
            content: [{ type: "input_text", text: m.body }],
          }));

        // Trigger periodic summary generation
        const totalMessages = await prisma.message.count({
          where: { contactId: contact.id },
        });
        if (totalMessages > 0 && totalMessages % SUMMARY_TRIGGER_COUNT === 0) {
          void this.generateAndSaveSummary(prisma, contact.id, phone);
        }
      }
    }

    const input: ChatMessage[] = [
      {
        role: "system",
        content: [{ type: "input_text", text: this.buildSystemPrompt(extras) }],
      },
      ...historyMessages,
      {
        role: "user",
        content: [{ type: "input_text", text: userMessage }],
      },
    ];

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        input,
        max_output_tokens: 350,
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(
        `OpenAI request failed (${response.status}): ${details || "no details"}`,
      );
    }

    const payload = (await response.json()) as OpenAIResponseBody;
    const text = safeParseText(payload);
    if (!text) {
      return "Nao consegui gerar uma resposta agora. Tente novamente em instantes.";
    }

    return trimForWhatsApp(text);
  }

  async extractLeadData(userMessage: string): Promise<LeadExtraction> {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: [
                  "Extraia dados estruturados de lead para atendimento de campeonato de esports.",
                  "Retorne APENAS JSON valido (sem markdown, sem texto extra).",
                  "Campos permitidos: name, email, tournament, eventDate, category, city, teamName, playersCount, wantsHuman, handoffReason.",
                  "Use null para campos desconhecidos.",
                  "wantsHuman=true somente se o usuario pedir atendimento humano explicitamente.",
                  "handoffReason deve ser curta e objetiva quando wantsHuman=true.",
                ].join(" "),
              },
            ],
          },
          {
            role: "user",
            content: [{ type: "input_text", text: userMessage }],
          },
        ],
        max_output_tokens: 220,
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(
        `OpenAI extraction failed (${response.status}): ${details || "no details"}`,
      );
    }

    const payload = (await response.json()) as OpenAIResponseBody;
    const parsed = extractFirstJsonObject(safeParseText(payload));
    if (!parsed) return {};

    return normalizeExtraction(parsed);
  }

  /** Generate a summary of the conversation and save to Contact.aiSummary */
  private async generateAndSaveSummary(
    prisma: import("@prisma/client").PrismaClient,
    contactId: number,
    phone: string,
  ): Promise<void> {
    try {
      const messages = await prisma.message.findMany({
        where: { contactId },
        orderBy: { createdAt: "asc" },
        take: 60,
        select: { direction: true, body: true },
      });

      const transcript = messages
        .map((m) => `${m.direction === "in" ? "Usuario" : "Assistente"}: ${m.body}`)
        .join("\n");

      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          input: [
            {
              role: "system",
              content: [
                {
                  type: "input_text",
                  text: "Resuma a conversa abaixo em no maximo 200 palavras, destacando: assuntos discutidos, preferencias do usuario, e proximos passos combinados. Responda apenas com o resumo.",
                },
              ],
            },
            {
              role: "user",
              content: [{ type: "input_text", text: transcript }],
            },
          ],
          max_output_tokens: 300,
        }),
      });

      if (!response.ok) return;

      const payload = (await response.json()) as OpenAIResponseBody;
      const summary = safeParseText(payload);
      if (!summary) return;

      await prisma.contact.update({
        where: { id: contactId },
        data: { aiSummary: summary },
      });

      console.log(`[ai-summary] updated summary for contact ${phone}`);
    } catch (error) {
      console.error(`[ai-summary] failed for contact ${phone}`, error);
    }
  }
}
