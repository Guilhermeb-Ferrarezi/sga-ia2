import type { PrismaClient } from "@prisma/client";
import { sanitizeMessageBodyForAi } from "../lib/messageContent";
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

const MAX_IMAGE_SUMMARY_SIZE = 180;

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
const FAQ_RELEVANCE_RATIO_THRESHOLD = 0.55;
const FAQ_SYNONYM_GROUPS = [
  ["preco", "valor", "valores", "Inscrição", "Inscriçao", "custa", "custa", "custo", "custos", "ticket", "tickets", "ingresso", "ingressos", "inscricao", "inscricoes", "participar", "participacao", "jogador", "jogadores", "individual", "vaga", "vagas", "comprar", "pagamento", "pix", "cartao", "taxa", "taxas", "investimento", "reembolso", "estorno"],
  ["campeonato", "campeonatos", "torneio", "torneios", "camp", "camps", "evento", "eventos"],
  ["edicao", "edicoes", "temporada"],
  ["data", "dia", "dias", "quando", "inicio", "comeco", "previsto", "previsao", "agenda"],
  ["horario", "horarios", "hora", "horas", "inicio", "comeco", "previsto", "turno", "duracao", "manha", "tarde", "noite", "periodo", "duração", "duraçao"],
  ["local", "endereco", "cidade", "onde", "arena", "presencial", "endereço", "lugar", "localizacao", "localização", "online"],
  ["time", "times", "equipe", "equipes", "elenco", "line", "lineup", "stack", "reserva", "reservas", "grupo", "grupos", "treino", "treinos"],
  ["regra", "regras", "formato", "md3", "md5", "double", "elimination", "checkin", "check-in", "wo", "w.o", "regulamento", "winner", "lower", "chave", "partida", "partidas", "ban", "bans", "lobby"],
  ["valorant", "valorante", "valarante", "vava", "vct", "valo", "valoran", "vctrp", "vct-rp"],
  ["cs", "cs2", "csgo", "counter-strike", "counter strike", "counterstrike", "csprime", "cs-prime", "prime"],
  ["corujao", "corujão", "madrugada", "virada"],
  ["mix", "mixgamer", "mix-gamer"],
];

const FAQ_TOKEN_CANONICAL_MAP = new Map<string, string>([
  ["preco", "preco"],
  ["valor", "preco"],
  ["valores", "preco"],
  ["custa", "preco"],
  ["custo", "preco"],
  ["custos", "preco"],
  ["ticket", "inscricao"],
  ["tickets", "inscricao"],
  ["ingresso", "inscricao"],
  ["ingressos", "inscricao"],
  ["inscricao", "inscricao"],
  ["inscricoes", "inscricao"],
  ["participar", "inscricao"],
  ["participacao", "inscricao"],
  ["jogador", "inscricao"],
  ["jogadores", "inscricao"],
  ["individual", "inscricao"],
  ["vaga", "inscricao"],
  ["vagas", "inscricao"],
  ["comprar", "inscricao"],
  ["pagamento", "inscricao"],
  ["pix", "inscricao"],
  ["cartao", "inscricao"],
  ["taxa", "preco"],
  ["taxas", "preco"],
  ["investimento", "preco"],
  ["reembolso", "preco"],
  ["estorno", "preco"],
  ["campeonato", "campeonato"],
  ["campeonatos", "campeonato"],
  ["torneio", "campeonato"],
  ["torneios", "campeonato"],
  ["camp", "campeonato"],
  ["camps", "campeonato"],
  ["evento", "campeonato"],
  ["eventos", "campeonato"],
  ["data", "data"],
  ["dia", "data"],
  ["dias", "data"],
  ["quando", "data"],
  ["previsao", "inicio"],
  ["agenda", "data"],
  ["horario", "horario"],
  ["horarios", "horario"],
  ["hora", "horario"],
  ["horas", "horario"],
  ["inicio", "inicio"],
  ["comeco", "inicio"],
  ["previsto", "inicio"],
  ["comeca", "inicio"],
  ["local", "local"],
  ["endereco", "local"],
  ["endereço", "local"],
  ["cidade", "local"],
  ["onde", "local"],
  ["arena", "local"],
  ["presencial", "local"],
  ["presencialmente", "local"],
  ["lugar", "local"],
  ["localizacao", "local"],
  ["localização", "local"],
  ["online", "local"],
  ["time", "time"],
  ["times", "time"],
  ["equipe", "time"],
  ["equipes", "time"],
  ["elenco", "time"],
  ["line", "time"],
  ["lineup", "time"],
  ["stack", "time"],
  ["reserva", "time"],
  ["reservas", "time"],
  ["grupo", "time"],
  ["grupos", "time"],
  ["treino", "time"],
  ["treinos", "time"],
  ["regra", "regra"],
  ["regras", "regra"],
  ["formato", "regra"],
  ["regulamento", "regra"],
  ["checkin", "regra"],
  ["check-in", "regra"],
  ["wo", "regra"],
  ["w.o", "regra"],
  ["winner", "regra"],
  ["lower", "regra"],
  ["chave", "regra"],
  ["partida", "regra"],
  ["partidas", "regra"],
  ["ban", "regra"],
  ["bans", "regra"],
  ["lobby", "regra"],
  ["valorant", "valorant"],
  ["valorante", "valorant"],
  ["valarante", "valorant"],
  ["vava", "valorant"],
  ["vct", "valorant"],
  ["valo", "valorant"],
  ["valoran", "valorant"],
  ["vctrp", "valorant"],
  ["vct-rp", "valorant"],
  ["cs", "counterstrike"],
  ["cs2", "counterstrike"],
  ["csgo", "counterstrike"],
  ["counter-strike", "counterstrike"],
  ["counter strike", "counterstrike"],
  ["counterstrike", "counterstrike"],
  ["csprime", "counterstrike"],
  ["cs-prime", "counterstrike"],
  ["prime", "counterstrike"],
  ["corujao", "corujao"],
  ["corujão", "corujao"],
  ["madrugada", "corujao"],
  ["virada", "corujao"],
  ["mix", "mix"],
  ["mixgamer", "mix"],
  ["mix-gamer", "mix"],
]);

const normalizeReplyIntent = (text: string): string =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const NAME_REQUEST_REGEX =
  /\b(como posso te chamar|como devo te chamar|qual (?:e|é) seu nome|como voce se chama|como vc se chama|me fala seu nome|me diz seu nome)\b/i;

const NATURAL_CITY_REQUEST_REGEX =
  /\b(de qual cidade voce e|de qual cidade voce eh|de qual cidade vc e|de qual cidade vc eh)\b/i;

const ensureNameQuestion = (
  reply: string,
  triageMissing?: string[],
): string => {
  if (!triageMissing?.includes("nome")) return reply;

  const trimmed = reply.trim();
  if (!trimmed) return "Como posso te chamar?";
  if (NAME_REQUEST_REGEX.test(normalizeReplyIntent(trimmed))) return trimmed;

  const separator = /[.!?]$/.test(trimmed) ? " " : ". ";
  return `${trimmed}${separator}Como posso te chamar?`;
};

const ensureNaturalCityQuestion = (
  reply: string,
  triageMissing?: string[],
): string => {
  if (!triageMissing?.includes("cidade")) return reply;

  const trimmed = reply.trim();
  if (!trimmed) return "De qual cidade voce e?";

  const normalized = normalizeReplyIntent(trimmed);
  if (!normalized.includes("cidade")) return trimmed;
  if (NATURAL_CITY_REQUEST_REGEX.test(normalized)) return trimmed;

  const replacements: Array<[RegExp, string]> = [
    [/\bqual sua cidade\b/i, "de qual cidade voce e"],
    [/\bqual a sua cidade\b/i, "de qual cidade voce e"],
    [/\bqual cidade voce e\b/i, "de qual cidade voce e"],
    [/\bqual cidade vc e\b/i, "de qual cidade voce e"],
    [/\bme fala a cidade\b/i, "me fala de qual cidade voce e"],
    [/\bme passa a cidade\b/i, "me passa de qual cidade voce e"],
    [/\bcidade\?\s*$/i, "de qual cidade voce e?"],
  ];

  let updated = trimmed;
  for (const [pattern, replacement] of replacements) {
    if (!pattern.test(updated)) continue;
    updated = updated.replace(pattern, replacement);
  }

  return updated;
};

const ensureNaturalTriageQuestions = (
  reply: string,
  triageMissing?: string[],
): string => ensureNaturalCityQuestion(ensureNameQuestion(reply, triageMissing), triageMissing);

const normalizeImageSummary = (value: string): string => {
  const normalized = value
    .replace(/\r/g, "")
    .replace(/\s+/g, " ")
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();
  if (!normalized) return "";

  const withoutPrefix = normalized.replace(
    /^(resumo|descricao|descricao curta|resumo rapido|resumo breve)\s*:?\s*/i,
    "",
  );
  const cleaned = withoutPrefix.trim() || normalized;
  if (cleaned.length <= MAX_IMAGE_SUMMARY_SIZE) return cleaned;
  return `${cleaned.slice(0, MAX_IMAGE_SUMMARY_SIZE - 3).trimEnd()}...`;
};

const buildImageDataUrl = (bytes: Uint8Array, mimeType: string): string =>
  `data:${mimeType || "image/jpeg"};base64,${Buffer.from(bytes).toString("base64")}`;

type FaqCandidate = {
  question: string;
  answer: string;
  content?: string | null;
  subject?: string | null;
  edition?: string | null;
};

type FaqDomain =
  | "valorant"
  | "counterstrike"
  | "corujao"
  | "mix";

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
  "queria",
  "quero",
  "se",
  "sem",
  "saber",
  "sobre",
  "esse",
  "essa",
  "esses",
  "essas",
  "desse",
  "dessa",
  "disso",
  "isso",
  "isto",
  "fala",
  "falar",
  "conta",
  "contar",
  "manda",
  "mostrar",
  "mostra",
  "ver",
  "detalhes",
  "detalhe",
  "informacao",
  "informacoes",
  "info",
  "infos",
  "uma",
  "umas",
  "um",
  "uns",
]);

const GENERIC_OVERVIEW_REQUEST_REGEX =
  /\b(queria saber|quero saber|me fala|me conta|sobre esse|sobre essa|mais sobre|quais as infos|quais as informacoes|me passa os detalhes)\b/i;

const normalizeFaqText = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const canonicalizeFaqToken = (token: string): string =>
  FAQ_TOKEN_CANONICAL_MAP.get(token) ?? token;

const tokenizeFaqText = (value: string): string[] =>
  normalizeFaqText(value)
    .split(" ")
    .filter((token) => token.length >= 3 && !FAQ_STOP_WORDS.has(token))
    .map(canonicalizeFaqToken);

const buildFaqTokenSet = (value: string): Set<string> =>
  new Set(tokenizeFaqText(value));

const resolveFaqDomainFromTokens = (tokens: Set<string>): FaqDomain | null => {
  if (tokens.has("valorant")) return "valorant";
  if (tokens.has("counterstrike")) return "counterstrike";
  if (tokens.has("corujao")) return "corujao";
  if (tokens.has("mix")) return "mix";
  return null;
};

const resolveFaqDomain = (faq: FaqCandidate): FaqDomain | null => {
  const subjectTokens = buildFaqTokenSet(faq.subject ?? "");
  const questionTokens = buildFaqTokenSet(normalizeFaqQuestion(faq.question));
  const headerDomain =
    resolveFaqDomainFromTokens(subjectTokens) ??
    resolveFaqDomainFromTokens(questionTokens);
  if (headerDomain) return headerDomain;

  const answerTokens = buildFaqTokenSet(faq.answer);
  const contentTokens = buildFaqTokenSet(faq.content ?? "");
  return (
    resolveFaqDomainFromTokens(answerTokens) ??
    resolveFaqDomainFromTokens(contentTokens)
  );
};

const resolveQueryFaqDomain = (
  directQueryTokens: Set<string>,
  historyTokens: Set<string>,
  contactInfoTokens: Set<string>,
): FaqDomain | null =>
  resolveFaqDomainFromTokens(directQueryTokens) ??
  resolveFaqDomainFromTokens(historyTokens) ??
  resolveFaqDomainFromTokens(contactInfoTokens);

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
  directQueryText: string,
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
  const prefersOverview =
    !asksForPrice &&
    !asksForDate &&
    !asksForTime &&
    !asksForLocation &&
    (directQueryTokens.size <= 2 || GENERIC_OVERVIEW_REQUEST_REGEX.test(directQueryText));

  const rankedParagraphs = paragraphs
    .map((paragraph, index) => {
      const paragraphTokens = buildFaqTokenSet(paragraph);
      const hasPrice = /r\$\s*\d|valor|preco|desconto/i.test(paragraph);
      const hasDate =
        /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b|domingo|segunda|terca|quarta|quinta|sexta|sabado/i.test(
          paragraph,
        );
      const hasTime =
        /\b\d{1,2}h\b|\b\d{1,2}:\d{2}\b|horario|hora|duracao|manha|tarde|noite/i.test(
          paragraph,
        );
      const hasLocation =
        /avenida|rua|endereco|local|arena|ribeirao|santos|jardim/i.test(paragraph);
      let score = countFaqTokenMatches(paragraphTokens, directQueryTokens) * 12;
      score += countFaqTokenMatches(paragraphTokens, expandedQueryTokens) * 3;

      if (asksForPrice && hasPrice) score += 24;
      if (asksForDate && hasDate) score += 20;
      if (asksForTime && hasTime) score += 20;
      if (asksForLocation && hasLocation) score += 20;

      if (prefersOverview && (hasPrice || hasDate || hasTime || hasLocation)) {
        score += 10;
      }

      if (index === 1) score += 4;
      if (index === 2 || index === 3) score += 2;

      return {
        paragraph,
        index,
        hasPrice,
        hasDate,
        hasTime,
        hasLocation,
        score,
      };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);

  const introParagraph =
    paragraphs.find(
      (paragraph) =>
        paragraph.length >= 80 &&
        !/r\$\s*\d|valor|preco|desconto/i.test(paragraph),
    ) ?? paragraphs[0];

  const addParagraph = (target: string[], paragraph: string | undefined): void => {
    if (!paragraph) return;
    if (target.includes(paragraph)) return;
    target.push(paragraph);
  };

  const selectedParagraphs: string[] = [];

  if (prefersOverview) {
    addParagraph(selectedParagraphs, introParagraph);
    addParagraph(
      selectedParagraphs,
      rankedParagraphs.find(
        (item) => item.hasDate || item.hasTime || item.hasLocation,
      )?.paragraph,
    );
  }

  if (asksForPrice) {
    addParagraph(
      selectedParagraphs,
      rankedParagraphs.find((item) => item.hasPrice)?.paragraph,
    );
  }
  if (asksForDate || asksForTime) {
    addParagraph(
      selectedParagraphs,
      rankedParagraphs.find((item) => item.hasDate || item.hasTime)?.paragraph,
    );
  }
  if (asksForLocation) {
    addParagraph(
      selectedParagraphs,
      rankedParagraphs.find((item) => item.hasLocation)?.paragraph,
    );
  }

  if (prefersOverview) {
    addParagraph(
      selectedParagraphs,
      rankedParagraphs.find((item) => item.hasPrice)?.paragraph,
    );
  }

  const maxParagraphs = prefersOverview ? 3 : 2;
  for (const item of rankedParagraphs) {
    if (selectedParagraphs.length >= maxParagraphs) break;
    addParagraph(selectedParagraphs, item.paragraph);
  }

  if (selectedParagraphs.length === 0) {
    addParagraph(selectedParagraphs, paragraphs[0]);
  }

  return trimFaqSnippet(selectedParagraphs.join("\n\n"));
};

const buildRelevantFaqContext = (
  faqs: FaqCandidate[],
  userMessage: string,
  historyMessages: ChatMessage[],
  contactInfo?: string,
): string | undefined => {
  if (!faqs.length) return undefined;

  const recentUserHistory = historyMessages
    .filter((message) => message.role === "user")
    .slice(-6)
    .map((message) => message.content.map((item) => item.text).join(" "))
    .join(" ");
  const query = [userMessage, recentUserHistory, contactInfo]
    .filter(Boolean)
    .join(" ")
    .trim();
  const normalizedQuery = normalizeFaqText(query);
  const directQueryText = normalizeFaqText(userMessage);
  const directQueryTokens = new Set(tokenizeFaqText(userMessage));
  const historyTokens = new Set(tokenizeFaqText(recentUserHistory));
  const contactInfoTokens = new Set(tokenizeFaqText(contactInfo ?? ""));
  const queryTokens = expandQueryTokens(new Set(tokenizeFaqText(query)));
  const queryDomain = resolveQueryFaqDomain(
    directQueryTokens,
    historyTokens,
    contactInfoTokens,
  );

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
      const faqDomain = resolveFaqDomain(faq);
      let score = 0;

      if (subjectText && normalizedQuery.includes(subjectText)) score += 60;
      if (editionText && normalizedQuery.includes(editionText)) score += 40;

      if (queryDomain && faqDomain) {
        if (queryDomain === faqDomain) score += 70;
        else score -= 90;
      }

      for (const token of directQueryTokens) {
        if (subjectTokens.has(token)) score += 18;
        else if (editionTokens.has(token)) score += 14;
        else if (questionTokens.has(token)) score += 12;
        else if (contentTokens.has(token)) score += 8;
        else if (answerTokens.has(token)) score += 7;
      }

      for (const token of historyTokens) {
        if (directQueryTokens.has(token)) continue;
        if (subjectTokens.has(token)) score += 7;
        else if (editionTokens.has(token)) score += 5;
        else if (questionTokens.has(token)) score += 4;
        else if (contentTokens.has(token)) score += 3;
        else if (answerTokens.has(token)) score += 2;
      }

      for (const token of queryTokens) {
        if (directQueryTokens.has(token) || historyTokens.has(token)) continue;
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

      if (directQueryTokens.has("inscricao") && combinedTokens.has("preco")) {
        score += 14;
      }
      if (directQueryTokens.has("preco") && combinedTokens.has("inscricao")) {
        score += 10;
      }
      if (
        directQueryTokens.has("inicio") &&
        (combinedTokens.has("data") || combinedTokens.has("horario"))
      ) {
        score += 14;
      }
      if (
        directQueryTokens.has("valorant") &&
        (subjectTokens.has("valorant") || combinedTokens.has("valorant"))
      ) {
        score += 24;
      }
      if (
        directQueryTokens.has("corujao") &&
        (subjectTokens.has("corujao") || combinedTokens.has("corujao"))
      ) {
        score += 24;
      }

      if (
        queryDomain === "valorant" &&
        faqDomain === "valorant" &&
        (subjectTokens.has("valorant") || combinedTokens.has("valorant"))
      ) {
        score += 30;
      }

      if (
        queryDomain === "counterstrike" &&
        faqDomain === "counterstrike" &&
        (subjectTokens.has("counterstrike") || combinedTokens.has("counterstrike"))
      ) {
        score += 30;
      }

      return {
        ...faq,
        question: normalizedQuestion,
        score,
        snippet: extractRelevantFaqSnippet(
          faq,
          directQueryTokens,
          queryTokens,
          directQueryText,
        ),
      };
    })
    .filter((faq) => faq.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, FAQ_SELECTION_LIMIT);

  const topScore = rankedFaqs[0]?.score ?? 0;
  const selectedFaqs = topScore > 0
    ? rankedFaqs.filter((faq) => faq.score >= Math.max(6, topScore * FAQ_RELEVANCE_RATIO_THRESHOLD))
    : [];
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
          "- Se o nome ainda nao estiver preenchido, cumprimente e peca primeiro como deve chamar o usuario antes de pedir os demais dados.",
          "- E-mail é opcional: so solicite se fizer sentido, sem travar o atendimento.",
          "- Se o usuario pedir humano, confirme o encaminhamento e nao insista na automacao.",
          "- Nunca use saudacao, despedida, nova confirmacao ou frase de transicao quando a proxima acao for encaminhar para humano.",
          "- Se oferecer verificacao com a equipe ou encaminhamento humano, use linguagem explicita como 'Quer que eu encaminhe para a equipe confirmar?'.",
          "- Se o usuario responder com confirmacao curta apos uma oferta de encaminhamento ou verificacao com a equipe, nao gere nova mensagem dizendo que vai encaminhar.",
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
        "- Triagem e secundaria a resposta principal: nunca peca um dado que ja esteja claro nas FAQs, na imagem ou na conversa atual.",
        "- Nao invente informacoes, valores, datas, regras, links ou edicoes.",
        "- Priorize triagem de lead para campeonato: nome, campeonato, data, categoria, cidade e time ou quantidade de jogadores.",
        "- Se o nome ainda nao estiver preenchido, cumprimente e peca primeiro como deve chamar o usuario antes de pedir os demais dados.",
        "- Quando precisar pedir a cidade do lead, pergunte de forma natural: 'De qual cidade voce e?'.",
        "- E-mail e opcional: so solicite se fizer sentido, sem travar o atendimento.",
        "- Se o usuario pedir humano, confirme o encaminhamento e nao insista na automacao.",
        "- Nunca use saudacao, despedida, nova confirmacao ou frase de transicao quando a proxima acao for encaminhar para humano.",
        "- Se oferecer verificacao com a equipe ou encaminhamento humano, use linguagem explicita como 'Quer que eu encaminhe para a equipe confirmar?'.",
        "- Se o usuario responder com confirmacao curta apos uma oferta de encaminhamento ou verificacao com a equipe, nao gere nova mensagem dizendo que vai encaminhar.",
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
        "- Se a FAQ recuperada trouxer preco, responda com o valor exato como esta escrito, sem arredondar nem reformular o numero.",
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
          "Esses campos faltantes servem para qualificar o lead, mas nunca bloqueiam a resposta principal.",
          "Se a FAQ recuperada, a imagem ou a conversa atual ja trouxer um desses dados, use essa informacao e nao peca para o usuario repetir.",
          "Pergunte apenas o necessario para fechar os campos realmente faltantes, sem repetir o que ja foi informado.",
          "Se precisar pedir cidade, prefira exatamente a formulacao: De qual cidade voce e?",
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

  async summarizeInboundImage(
    image: {
      bytes: Uint8Array;
      mimeType: string;
      caption?: string | null;
    },
    prisma?: PrismaClient,
  ): Promise<string> {
    try {
      const settings = await this.getRuntimeSettings(prisma);
      const caption = image.caption?.trim();
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
                    "Resuma a imagem em portugues do Brasil para um atendimento de campeonatos.",
                    "Responda em uma frase curta, com no maximo 24 palavras.",
                    "Priorize nome do campeonato, jogo, data, cidade, categoria e qualquer texto grande claramente legivel.",
                    "Cite apenas o que for visivel ou texto claramente legivel.",
                    "Nao use aspas, nao enumere e nao invente contexto, identidade, local ou intencao.",
                    "Se a imagem estiver pouco clara, responda exatamente: imagem recebida sem detalhes claros",
                  ].join(" "),
                },
              ],
            },
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: caption
                    ? `Texto enviado junto com a imagem: ${caption}`
                    : "A imagem chegou sem texto do usuario.",
                },
                {
                  type: "input_image",
                  image_url: buildImageDataUrl(image.bytes, image.mimeType),
                },
              ],
            },
          ],
          max_output_tokens: 120,
        }),
      });

      if (!response.ok) {
        const details = await response.text();
        throw new Error(
          `OpenAI image summary failed (${response.status}): ${details || "no details"}`,
        );
      }

      const payload = (await response.json()) as OpenAIResponseBody;
      return normalizeImageSummary(safeParseText(payload));
    } catch (error) {
      console.warn("[openai:image-summary] failed", error);
      return "";
    }
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
              {
                type: m.direction === "in" ? "input_text" : "output_text",
                text: sanitizeMessageBodyForAi(m.body),
              },
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

    return trimForWhatsApp(
      ensureNaturalTriageQuestions(text, options?.triageMissing),
    );
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
                  "Campos permitidos: name, email, tournament, eventDate, category, city, teamName, playersCount, wantsHuman, handoffReason.",
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
        .map(
          (m) =>
            `${m.direction === "in" ? "Usuario" : "Assistente"}: ${sanitizeMessageBodyForAi(m.body)}`,
        )
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
