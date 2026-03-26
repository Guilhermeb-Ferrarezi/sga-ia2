import type { PrismaClient } from "@prisma/client";
import { resolveAiSettings, type AiSettingsSnapshot } from "./aiSettings";

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

type StoredHistoryMessage = {
  direction: "in" | "out";
  body: string;
};

const trimTrailingMergedUserMessages = (
  messages: StoredHistoryMessage[],
  mergedUserMessagesCount: number,
): StoredHistoryMessage[] => {
  if (mergedUserMessagesCount <= 0 || messages.length === 0) return messages;

  const trimmed = [...messages];
  let remaining = mergedUserMessagesCount;

  while (trimmed.length > 0 && remaining > 0) {
    const lastMessage = trimmed[trimmed.length - 1];
    if (!lastMessage) break;
    if (lastMessage.direction !== "in") break;
    trimmed.pop();
    remaining -= 1;
  }

  return trimmed;
};

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

export interface GenerateReplyOptions {
  triageMissing?: string[];
  resumePendingContext?: string;
  resumeMergedUserMessagesCount?: number;
  mode?: "webhook" | "resume";
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
const FAQ_SELECTION_LIMIT = 3;
const FAQ_MAX_CONTEXT_CHARS = 4000;
const FAQ_SNIPPET_MAX_CHARS = 900;
const FAQ_CONTENT_ONLY_PREFIX = "__content__:";
const FAQ_SYNONYM_GROUPS = [
  ["preco", "valor", "custa", "custo", "ticket", "ingresso", "inscricao"],
  ["campeonato", "torneio", "camp"],
  ["edicao", "temporada"],
  ["data", "dia", "quando"],
  ["horario", "hora", "horas"],
  ["local", "endereco", "cidade", "onde"],
  ["time", "equipe", "elenco"],
  ["regra", "regras", "formato", "md3", "md5", "double", "elimination"],
];

type FaqCandidate = {
  question: string;
  answer: string;
  content?: string | null;
  subject?: string | null;
  edition?: string | null;
};

const FAQ_STOP_WORDS = new Set([
  "a",
  "ao",
  "aos",
  "as",
  "com",
  "como",
  "da",
  "das",
  "de",
  "do",
  "dos",
  "e",
  "em",
  "na",
  "nas",
  "no",
  "nos",
  "o",
  "os",
  "ou",
  "para",
  "por",
  "pra",
  "qual",
  "quais",
  "que",
  "se",
  "sem",
  "uma",
  "umas",
  "um",
  "uns",
]);

const normalizeFaqText = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokenizeFaqText = (value: string): string[] =>
  normalizeFaqText(value)
    .split(" ")
    .filter((token) => token.length >= 3 && !FAQ_STOP_WORDS.has(token));

const buildFaqTokenSet = (value: string): Set<string> =>
  new Set(tokenizeFaqText(value));

const hasFaqContentOnlyQuestion = (question: string): boolean =>
  question.startsWith(FAQ_CONTENT_ONLY_PREFIX);

const normalizeFaqQuestion = (question: string): string =>
  hasFaqContentOnlyQuestion(question) ? "" : question.trim();

const expandQueryTokens = (tokens: Set<string>): Set<string> => {
  const expanded = new Set(tokens);
  for (const group of FAQ_SYNONYM_GROUPS) {
    const intersects = group.some((token) => expanded.has(token));
    if (!intersects) continue;
    for (const token of group) {
      expanded.add(token);
    }
  }
  return expanded;
};

const countFaqTokenMatches = (
  sourceTokens: Set<string>,
  queryTokens: Set<string>,
): number => {
  let matches = 0;
  for (const token of queryTokens) {
    if (sourceTokens.has(token)) matches += 1;
  }
  return matches;
};

const textContainsAnyFaqToken = (
  tokens: Set<string>,
  candidates: readonly string[],
): boolean => candidates.some((token) => tokens.has(token));

const trimFaqSnippet = (value: string, maxChars = FAQ_SNIPPET_MAX_CHARS): string => {
  const normalized = value.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars - 3).trimEnd()}...`;
};

const extractRelevantFaqSnippet = (
  faq: FaqCandidate,
  directQueryTokens: Set<string>,
  expandedQueryTokens: Set<string>,
): string => {
  const baseSources = [faq.content ?? "", faq.answer ?? ""]
    .map((value) => value.trim())
    .filter(Boolean);
  const paragraphs = Array.from(
    new Set(
      baseSources.flatMap((value) =>
        value
          .split(/\n{2,}/)
          .map((paragraph) => paragraph.trim())
          .filter(Boolean),
      ),
    ),
  );

  const asksForPrice = textContainsAnyFaqToken(directQueryTokens, FAQ_SYNONYM_GROUPS[0] ?? []);
  const asksForDate = textContainsAnyFaqToken(directQueryTokens, FAQ_SYNONYM_GROUPS[3] ?? []);
  const asksForTime = textContainsAnyFaqToken(directQueryTokens, FAQ_SYNONYM_GROUPS[4] ?? []);
  const asksForLocation = textContainsAnyFaqToken(directQueryTokens, FAQ_SYNONYM_GROUPS[5] ?? []);

  const rankedParagraphs = paragraphs
    .map((paragraph) => {
      const paragraphTokens = buildFaqTokenSet(paragraph);
      let score = countFaqTokenMatches(paragraphTokens, directQueryTokens) * 12;
      score += countFaqTokenMatches(paragraphTokens, expandedQueryTokens) * 3;

      if (asksForPrice && /r\$\s*\d|valor|preco|desconto/i.test(paragraph)) {
        score += 18;
      }
      if (asksForDate && /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b|domingo|segunda|terca|quarta|quinta|sexta|sabado/i.test(paragraph)) {
        score += 18;
      }
      if (asksForTime && /\b\d{1,2}h\b|\b\d{1,2}:\d{2}\b|horario|hora/i.test(paragraph)) {
        score += 18;
      }
      if (asksForLocation && /avenida|rua|endereco|local|arena|ribeirao|santos/i.test(paragraph)) {
        score += 18;
      }

      return {
        paragraph,
        score,
      };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);

  const selectedParagraphs = rankedParagraphs.length > 0
    ? rankedParagraphs.slice(0, 2).map((item) => item.paragraph)
    : paragraphs.slice(0, 1);

  return trimFaqSnippet(selectedParagraphs.join("\n\n"));
};

const buildRelevantFaqContext = (
  faqs: FaqCandidate[],
  userMessage: string,
  historyMessages: ChatMessage[],
  contactInfo?: string,
): string | undefined => {
  if (!faqs.length) return undefined;

  const recentHistory = historyMessages
    .slice(-6)
    .map((message) => message.content.map((item) => item.text).join(" "))
    .join(" ");
  const query = [userMessage, recentHistory, contactInfo]
    .filter(Boolean)
    .join(" ")
    .trim();
  const normalizedQuery = normalizeFaqText(query);
  const directQueryTokens = new Set(tokenizeFaqText([userMessage, recentHistory].filter(Boolean).join(" ").trim()));
  const queryTokens = expandQueryTokens(new Set(tokenizeFaqText(query)));

  const rankedFaqs = faqs
    .map((faq) => {
      const normalizedQuestion = normalizeFaqQuestion(faq.question);
      const questionText = normalizeFaqText(normalizedQuestion);
      const answerText = normalizeFaqText(faq.answer);
      const subjectText = normalizeFaqText(faq.subject ?? "");
      const editionText = normalizeFaqText(faq.edition ?? "");
      const contentText = normalizeFaqText(faq.content ?? "");
      const questionTokens = buildFaqTokenSet(normalizedQuestion);
      const answerTokens = buildFaqTokenSet(faq.answer);
      const subjectTokens = buildFaqTokenSet(faq.subject ?? "");
      const editionTokens = buildFaqTokenSet(faq.edition ?? "");
      const contentTokens = buildFaqTokenSet(faq.content ?? "");
      const combinedTokens = new Set([
        ...questionTokens,
        ...answerTokens,
        ...subjectTokens,
        ...editionTokens,
        ...contentTokens,
      ]);
      let score = 0;

      if (subjectText && normalizedQuery.includes(subjectText)) score += 60;
      if (editionText && normalizedQuery.includes(editionText)) score += 40;

      for (const token of directQueryTokens) {
        if (subjectTokens.has(token)) score += 18;
        else if (editionTokens.has(token)) score += 14;
        else if (questionTokens.has(token)) score += 12;
        else if (contentTokens.has(token)) score += 8;
        else if (answerTokens.has(token)) score += 7;
      }

      for (const token of queryTokens) {
        if (directQueryTokens.has(token)) continue;
        if (subjectTokens.has(token)) score += 5;
        else if (editionTokens.has(token)) score += 4;
        else if (questionTokens.has(token)) score += 3;
        else if (contentTokens.has(token)) score += 2;
        else if (answerTokens.has(token)) score += 1;
      }

      const exactMatches = countFaqTokenMatches(combinedTokens, directQueryTokens);
      score += exactMatches * 6;
      if (directQueryTokens.size > 0 && exactMatches === directQueryTokens.size) {
        score += 12;
      }

      if (
        combinedTokens.has("campeonato") &&
        (queryTokens.has("campeonato") || queryTokens.has("torneio"))
      ) {
        score += 2;
      }

      return {
        ...faq,
        question: normalizedQuestion,
        score,
        snippet: extractRelevantFaqSnippet(faq, directQueryTokens, queryTokens),
      };
    })
    .filter((faq) => faq.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, FAQ_SELECTION_LIMIT);

  const selectedFaqs = rankedFaqs.length > 0 ? rankedFaqs : [];
  let totalChars = 0;
  const chunks: string[] = [];

  for (const faq of selectedFaqs) {
    const sectionParts = [
      faq.subject ? `Assunto: ${faq.subject}` : null,
      faq.edition ? `Edicao: ${faq.edition}` : null,
      faq.question ? `P: ${faq.question}` : null,
      faq.snippet ? `Trechos relevantes:\n${faq.snippet}` : `R: ${trimFaqSnippet(faq.answer)}`,
    ].filter(Boolean);
    const section = sectionParts.join("\n");
    if (totalChars > 0 && totalChars + section.length > FAQ_MAX_CONTEXT_CHARS) break;
    chunks.push(section);
    totalChars += section.length;
  }

  return chunks.length > 0 ? chunks.join("\n\n") : undefined;
};

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
    private readonly appName: string,
    private readonly transcriptionModel: string,
  ) {}

  async getRuntimeSettings(prisma?: PrismaClient): Promise<AiSettingsSnapshot> {
    return resolveAiSettings(prisma);
  }

  private buildSystemPrompt(
    settings: AiSettingsSnapshot,
    extras?: {
    faqs?: string;
    contactInfo?: string;
    aiSummary?: string;
    triageMissing?: string[];
    audioList?: string;
  },
  ): string {
    const sections: string[] = [];

    if (settings.systemPrompt) {
      sections.push(
        [
          "--- Instrucao principal configurada no painel ---",
          settings.systemPrompt,
        ].join("\n"),
      );
    } else {
      sections.push(
        [
          `Voce e ${this.appName}, uma assistente de WhatsApp para atendimento de campeonatos de esports.`,
          `Idioma principal: ${settings.language}.`,
          `Personalidade: ${settings.personality}.`,
          `Estilo de resposta: ${settings.style}.`,
          "Regras de comportamento:",
          "- Seja clara, rapida e util.",
          "- Faca perguntas objetivas quando faltar contexto.",
          "- Evite texto longo e sem acao.",
          "- Nao invente informacoes.",
          "- Quando houver FAQ recuperada para a pergunta atual, use essa informacao como fonte principal.",
          "- Se a informacao procurada nao estiver no contexto recuperado, diga isso claramente em vez de supor.",
          "- Priorize triagem de lead para campeonato: nome, campeonato, data, categoria, cidade e time ou quantidade de jogadores.",
          "- E-mail é opcional: so solicite se fizer sentido, sem travar o atendimento.",
          "- Se o usuario pedir humano, confirme o encaminhamento e nao insista na automacao.",
        ].join("\n"),
      );
    }

    sections.push(
      [
        "\n--- Regras obrigatorias do sistema ---",
        "- Seja clara, rapida e util.",
        "- Responda primeiro a duvida principal do usuario e pare assim que isso estiver claro.",
        "- Por padrao, responda em 1 ou 2 frases curtas.",
        "- So detalhe mais se o usuario pedir mais informacoes.",
        "- Use no maximo 1 pergunta curta no final, e apenas se isso ajudar a avancar o atendimento.",
        "- Faca perguntas objetivas quando faltar contexto.",
        "- Evite texto longo, enrolacao e respostas sem proximo passo.",
        "- Nao invente informacoes, valores, datas, regras, links ou edicoes.",
        "- Priorize triagem de lead para campeonato: nome, campeonato, data, categoria, cidade e time ou quantidade de jogadores.",
        "- E-mail e opcional: so solicite se fizer sentido, sem travar o atendimento.",
        "- Se o usuario pedir humano, confirme o encaminhamento e nao insista na automacao.",
      ].join("\n"),
    );

    sections.push(
      [
        "\n--- Protocolo de uso das FAQs recuperadas ---",
        "- A secao de FAQs recuperadas abaixo e sua fonte principal para responder sobre campeonatos.",
        "- Considere que a recuperacao ja trouxe os itens mais relevantes para a mensagem atual.",
        "- Busque a resposta usando em conjunto: pergunta, resposta, assunto, edicao e detalhes da FAQ.",
        "- Para perguntas curtas como 'quanto custa?', 'qual o horario?', 'qual a edicao?', 'como funciona?', 'onde e?' e 'como faz para se inscrever?', relacione a pergunta atual com a FAQ recuperada mais proxima, mesmo que o texto nao seja identico.",
        "- Se duas FAQs forem complementares, combine as informacoes sem contradizer nenhuma.",
        "- Se a FAQ recuperada trouxer valor, data, horario, regra, local, edicao ou passo a passo, responda diretamente com essa informacao.",
        "- Se a informacao nao estiver claramente presente nas FAQs recuperadas, diga isso explicitamente e faca uma pergunta objetiva ou ofereca encaminhamento humano.",
        "- Nunca diga que nao sabe antes de verificar a secao de FAQs recuperadas.",
        "- Nunca encaminhe para humano so porque a pergunta e sobre preco, funcionamento, regras, data, local, edicao, inscricao ou formato.",
      ].join("\n"),
    );

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

    if (extras?.audioList) {
      sections.push(
        [
          "\n--- Audios disponiveis ---",
          "Voce tem acesso a audios pre-gravados que podem ser enviados ao usuario.",
          "PREFIRA enviar um audio quando a pergunta do usuario for diretamente respondida por um audio disponivel.",
          "Para enviar um audio, inclua EXATAMENTE a marcacao [AUDIO:ID] no INICIO da sua resposta, onde ID e o numero do audio.",
          "Voce pode adicionar uma mensagem curta de texto DEPOIS da marcacao, por exemplo: [AUDIO:3] Segue o audio sobre inscricoes!",
          "Se nenhum audio se encaixar, responda normalmente so com texto.",
          "Audios disponiveis:",
          extras.audioList,
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
    prisma?: PrismaClient,
    phone?: string,
    options?: GenerateReplyOptions,
  ): Promise<string> {
    const settings = await this.getRuntimeSettings(prisma);
    console.log(
      `[openai:reply] mode=${options?.mode ?? "webhook"} model=${settings.model}${phone ? ` phone=${phone}` : ""}`,
    );
    let historyMessages: ChatMessage[] = [];
    let extras: {
      faqs?: string;
      contactInfo?: string;
      aiSummary?: string;
      triageMissing?: string[];
      audioList?: string;
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
        select: {
          question: true,
          answer: true,
          content: true,
          subject: true,
          edition: true,
        },
      });

      // Load available audios for the AI to choose from
      const audios = await prisma.audio.findMany({
        select: { id: true, title: true, category: true },
        orderBy: { title: "asc" },
      });
      if (audios.length) {
        extras.audioList = audios
          .map((a) => `- ID ${a.id}: "${a.title}" (categoria: ${a.category})`)
          .join("\n");
      }

      // Load recent conversation history
      if (contact) {
        const recentMessages = await prisma.message.findMany({
          where: { contactId: contact.id },
          orderBy: { createdAt: "desc" },
          take: CONTEXT_MESSAGE_LIMIT,
          select: { direction: true, body: true },
        });

        const chronologicalMessages = recentMessages.reverse() as StoredHistoryMessage[];
        const dedupedMessages = trimTrailingMergedUserMessages(
          chronologicalMessages,
          Math.max(0, options?.resumeMergedUserMessagesCount ?? 0),
        );

        historyMessages = dedupedMessages
          .map((m) => ({
            role: (m.direction === "in" ? "user" : "assistant") as "user" | "assistant",
            content: [
              { type: m.direction === "in" ? "input_text" : "output_text", text: m.body },
            ],
          }));

        // Trigger periodic summary generation
        const totalMessages = await prisma.message.count({
          where: { contactId: contact.id },
        });
        if (totalMessages > 0 && totalMessages % SUMMARY_TRIGGER_COUNT === 0) {
          void this.generateAndSaveSummary(prisma, contact.id, phone);
        }
      }

      if (faqs.length) {
        extras.faqs = buildRelevantFaqContext(
          faqs,
          userMessage,
          historyMessages,
          extras.contactInfo,
        );
      }
    }

    const input: ChatMessage[] = [
      {
        role: "system",
        content: [{ type: "input_text", text: this.buildSystemPrompt(settings, extras) }],
      },
      ...historyMessages,
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: options?.resumePendingContext?.trim() || userMessage,
          },
        ],
      },
    ];

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: settings.model,
        input,
        max_output_tokens: 220,
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

  async extractLeadData(
    userMessage: string,
    prisma?: PrismaClient,
  ): Promise<LeadExtraction> {
    const settings = await this.getRuntimeSettings(prisma);
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: settings.model,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: [
                  "Extraia dados estruturados de lead para atendimento de campeonato de esports.",
                  "Retorne APENAS JSON valido (sem markdown, sem texto extra).",
                  "Campos permitidos: name, email, tournament, category, city, teamName, playersCount, wantsHuman, handoffReason.",
                  "Use null para campos desconhecidos.",
                  "wantsHuman=true somente se o usuario pedir atendimento humano explicitamente.",
                  "Perguntas sobre preco, valor, custo, inscricao, ticket, horario, data, local, regras, formato, edicao e funcionamento NAO sao pedido de humano.",
                  "Exemplo: 'quanto custa?' => wantsHuman=false.",
                  "Exemplo: 'quero falar com um atendente' => wantsHuman=true.",
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

  /**
   * Detect if a user message contains a task/reminder intent.
   * Returns { title, dueAt } or null.
   */
  async detectTaskIntent(
    userMessage: string,
    prisma?: PrismaClient,
  ): Promise<{ title: string; dueAt: string } | null> {
    const settings = await this.getRuntimeSettings(prisma);
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: settings.model,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: [
                  "Analise a mensagem do usuario e detecte se contem um pedido de tarefa, lembrete ou acao futura.",
                  `A data de hoje e: ${new Date().toISOString().slice(0, 10)}.`,
                  "INCLUA: 'me lembra de...', 'preciso de...', 'configura...', 'agenda...', 'manda amanha...', 'envia depois...'",
                  "EXCLUA: perguntas, saudações, dados de triagem, respostas simples.",
                  "Se for tarefa, retorne JSON: {\"title\": \"<titulo curto>\", \"dueAt\": \"<ISO date string>\"}",
                  "Se nao for tarefa, retorne: {\"skip\": true}",
                  "Retorne APENAS JSON valido, sem markdown.",
                ].join(" "),
              },
            ],
          },
          {
            role: "user",
            content: [{ type: "input_text", text: userMessage }],
          },
        ],
        max_output_tokens: 150,
      }),
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as OpenAIResponseBody;
    const parsed = extractFirstJsonObject(safeParseText(payload));
    if (!parsed || parsed.skip === true) return null;

    const title = typeof parsed.title === "string" ? parsed.title.trim() : null;
    const dueAt = typeof parsed.dueAt === "string" ? parsed.dueAt.trim() : null;
    if (!title || !dueAt) return null;

    const parsedDate = new Date(dueAt);
    if (Number.isNaN(parsedDate.getTime())) return null;

    return { title, dueAt: parsedDate.toISOString() };
  }

  /**
   * Evaluate whether a user message + AI reply pair is generic enough to become a FAQ.
   * Returns a normalized { question, answer } or null if the message should not be a FAQ.
   */
  async suggestFaqEntry(
    userMessage: string,
    assistantReply: string,
    prisma?: PrismaClient,
  ): Promise<{ question: string; answer: string } | null> {
    const settings = await this.getRuntimeSettings(prisma);
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: settings.model,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: [
                  "Voce analisa conversas de atendimento via WhatsApp sobre campeonatos de esports.",
                  "Seu objetivo: decidir se a pergunta do usuario e generica o suficiente para virar um FAQ reutilizavel.",
                  "INCLUA como FAQ: perguntas sobre regras, inscricao geral, categorias, datas, taxas, formatos, requisitos.",
                  "EXCLUA: dados pessoais (nome, email, telefone), saudacoes, pedidos de humano, dados especificos de triagem.",
                  "Se adequado, retorne JSON: {\"question\": \"<pergunta clara e generalizada>\", \"answer\": \"<resposta clara e objetiva>\"}",
                  "Se NAO adequado, retorne: {\"skip\": true}",
                  "Retorne APENAS JSON valido, sem markdown.",
                ].join(" "),
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `Pergunta do usuario: "${userMessage}"\nResposta do assistente: "${assistantReply}"`,
              },
            ],
          },
        ],
        max_output_tokens: 350,
      }),
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as OpenAIResponseBody;
    const parsed = extractFirstJsonObject(safeParseText(payload));
    if (!parsed) return null;

    if (parsed.skip === true) return null;

    const question = typeof parsed.question === "string" ? parsed.question.trim() : null;
    const answer = typeof parsed.answer === "string" ? parsed.answer.trim() : null;

    if (!question || !answer) return null;
    return { question, answer };
  }

  /** Generate a summary of the conversation and save to Contact.aiSummary */
  async refreshConversationSummary(
    prisma: PrismaClient,
    contactId: number,
    phone: string,
  ): Promise<void> {
    await this.generateAndSaveSummary(prisma, contactId, phone);
  }

  /** Generate a summary of the conversation and save to Contact.aiSummary */
  private async generateAndSaveSummary(
    prisma: PrismaClient,
    contactId: number,
    phone: string,
  ): Promise<void> {
    try {
      const settings = await this.getRuntimeSettings(prisma);
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
          model: settings.model,
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
