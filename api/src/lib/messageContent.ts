const AUDIO_MESSAGE_BODY_REGEX = /\[AUDIO:[^\]|]+\|([^\]]*)\]/g;
const IMAGE_MESSAGE_BODY_REGEX = /\[IMAGE:[^\]|]+\|([^\]]*)\]/g;
const IMAGE_MESSAGE_URL_REGEX = /\[IMAGE:([^\]|]+)\|[^\]]*\]/g;

const collapseWhitespace = (value: string): string =>
  value.replace(/\s+/g, " ").trim();

const normalizeForAi = (value: string): string =>
  value
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => collapseWhitespace(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const sanitizeMarkerText = (value: string | null | undefined): string =>
  collapseWhitespace((value ?? "").replace(/[\[\]\|]/g, " "));

const replaceAudioMarkers = (value: string, label: string): string =>
  value.replace(AUDIO_MESSAGE_BODY_REGEX, (_, title: string) => {
    const normalizedTitle = sanitizeMarkerText(title);
    return normalizedTitle ? `${label}: ${normalizedTitle}` : label;
  });

const replaceImageMarkers = (value: string): string =>
  value.replace(IMAGE_MESSAGE_BODY_REGEX, (_, caption: string) => {
    const normalizedCaption = sanitizeMarkerText(caption);
    return normalizedCaption
      ? `Imagem recebida: ${normalizedCaption}`
      : "Imagem recebida";
  });

export const buildImageMessageBody = (
  url: string,
  caption?: string | null,
): string => `[IMAGE:${url}|${sanitizeMarkerText(caption)}]`;

export const sanitizeMessageBodyForPreview = (body: string): string => {
  const normalized = collapseWhitespace(
    replaceImageMarkers(replaceAudioMarkers(body, "Audio")),
  );
  return normalized || "Midia recebida";
};

export const sanitizeMessageBodyForAi = (body: string): string => {
  const normalized = normalizeForAi(
    replaceImageMarkers(replaceAudioMarkers(body, "Audio enviado")),
  );
  return normalized || "Midia recebida";
};

export const extractImageMessageUrls = (body: string): string[] => {
  const matches = body.matchAll(IMAGE_MESSAGE_URL_REGEX);
  const urls = Array.from(matches, (match) => match[1]?.trim() ?? "").filter(Boolean);
  return Array.from(new Set(urls));
};
