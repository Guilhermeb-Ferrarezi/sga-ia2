const AUDIO_TAG_RE = /^\[AUDIO:(.+?)\|(.+?)\]$/;
const IMAGE_TAG_RE = /^\[IMAGE:(.+?)\|(.*?)\]$/;

const collapseWhitespace = (value: string): string =>
  value.replace(/\s+/g, " ").trim();

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
    url: match[1],
    caption: caption || null,
  };
};

export const getMessagePreviewText = (content: string): string => {
  const image = parseImageMessageContent(content);
  if (image) {
    return image.caption ? `Imagem: ${image.caption}` : "Imagem recebida";
  }

  const audio = parseAudioMessageContent(content);
  if (audio) {
    const title = collapseWhitespace(audio.title);
    return title ? `Audio: ${title}` : "Audio enviado";
  }

  return collapseWhitespace(content);
};
