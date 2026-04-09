import { API_BASE } from "./api";

const AUDIO_TAG_RE = /^\[AUDIO:(.+?)\|(.+?)\]$/;
const IMAGE_TAG_RE = /^\[IMAGE:(.+?)\|(.*?)\]$/;
const IMAGE_PLACEHOLDER_RE = /^imagem recebida(?::\s*(.+))?$/i;
const GENERIC_MEDIA_PLACEHOLDER_RE = /^midia recebida$/i;

const collapseWhitespace = (value: string): string =>
  value.replace(/\s+/g, " ").trim();

const buildImageAssetUrl = (url: string): string => {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("/")) return trimmed;
  if (trimmed.includes("/media/image?")) return trimmed;
  return `${API_BASE}/media/image?url=${encodeURIComponent(trimmed)}`;
};

export const parseAudioMessageContent = (
  content: string,
): { url: string; title: string } | null => {
  const match = AUDIO_TAG_RE.exec(content.trim());
  if (!match) return null;
  return { url: match[1], title: match[2] };
};

export const parseImageMessageContent = (
  content: string,
): { url: string; caption: string | null } | null => {
  const match = IMAGE_TAG_RE.exec(content.trim());
  if (!match) return null;

  const caption = collapseWhitespace(match[2]);
  return {
    url: buildImageAssetUrl(match[1]),
    caption: caption || null,
  };
};

export const parseImagePlaceholderContent = (
  content: string,
): { caption: string | null } | null => {
  const match = IMAGE_PLACEHOLDER_RE.exec(content.trim());
  if (!match) return null;

  const caption = collapseWhitespace(match[1] ?? "");
  return { caption: caption || null };
};

export const isGenericMediaPlaceholder = (content: string): boolean =>
  GENERIC_MEDIA_PLACEHOLDER_RE.test(collapseWhitespace(content));

export const getMessagePreviewText = (content: string): string => {
  const image = parseImageMessageContent(content);
  if (image) {
    return image.caption ? `Imagem: ${image.caption}` : "Imagem recebida";
  }

  const imagePlaceholder = parseImagePlaceholderContent(content);
  if (imagePlaceholder) {
    return imagePlaceholder.caption
      ? `Imagem: ${imagePlaceholder.caption}`
      : "Imagem recebida";
  }

  if (isGenericMediaPlaceholder(content)) {
    return "Midia recebida";
  }

  const audio = parseAudioMessageContent(content);
  if (audio) {
    const title = collapseWhitespace(audio.title);
    return title ? `Audio: ${title}` : "Audio enviado";
  }

  return collapseWhitespace(content);
};
