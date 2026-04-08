const HUMAN_HANDOFF_REQUEST_PATTERNS = [
  /\bquero falar com (?:um )?atendente\b/i,
  /\bquero falar com (?:uma )?pessoa\b/i,
  /\bquero falar com alguem\b/i,
  /\bquero atendimento humano\b/i,
  /\bquero suporte humano\b/i,
  /\bquero um atendente\b/i,
  /\bpreciso falar com (?:um )?atendente\b/i,
  /\bpreciso de atendimento humano\b/i,
  /\bpreciso de suporte humano\b/i,
  /\bfalar com (?:um )?atendente\b/i,
  /\bfalar com o suporte\b/i,
  /\bfalar com (?:uma )?pessoa real\b/i,
  /\bfalar com alguem do atendimento\b/i,
  /\bme passa para (?:um )?atendente\b/i,
  /\bme encaminha para (?:um )?atendente\b/i,
  /\bme transfere para (?:um )?atendente\b/i,
  /\bpassa para (?:um )?humano\b/i,
  /\bencaminha para (?:um )?humano\b/i,
  /\btransfere para (?:um )?humano\b/i,
];

const HANDOFF_CONFIRMATION_REPLY_REGEX =
  /^(sim|s|ok|okay|claro|claro que sim|pode|pode sim|pode ser|quero sim|isso|isso mesmo|confirmo|confirmado|blz|beleza|fechado|por favor|favor)$/i;

const HANDOFF_OFFER_PATTERNS = [
  /\bquer que eu (?:ja )?(?:encaminhe para (?:a )?equipe|encaminhe para (?:um )?atendente|passe para (?:a )?equipe|passe para (?:um )?atendente|verifique com a equipe|confirme com a equipe|solicite a confirmacao com a equipe)\b/i,
  /\b(?:posso|vou) (?:ja )?(?:encaminhar para (?:a )?equipe|encaminhar para (?:um )?atendente|passar para (?:a )?equipe|passar para (?:um )?atendente|verificar com a equipe|confirmar com a equipe)\b/i,
  /\bencaminhar sua duvida para (?:a )?equipe\b/i,
  /\bencaminhar para (?:um )?atendente\b/i,
  /\bencaminhar para (?:a )?equipe\b/i,
  /\batendente do nosso time\b/i,
  /\bcontinuar seu atendimento\b/i,
  /\batendimento humano\b/i,
];

export const normalizeIntentText = (text: string): string =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export const hasExplicitHumanHandoffRequest = (text: string): boolean => {
  const normalized = normalizeIntentText(text);
  return HUMAN_HANDOFF_REQUEST_PATTERNS.some((pattern) => pattern.test(normalized));
};

export const isHandoffConfirmationReply = (text: string): boolean =>
  HANDOFF_CONFIRMATION_REPLY_REGEX.test(normalizeIntentText(text));

export const didMessageOfferHumanHandoff = (text: string): boolean => {
  const normalized = normalizeIntentText(text);
  return HANDOFF_OFFER_PATTERNS.some((pattern) => pattern.test(normalized));
};
