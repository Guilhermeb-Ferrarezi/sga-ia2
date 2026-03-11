import type {
  InboundMessage,
  WhatsAppMessage,
  WhatsAppWebhookPayload,
} from "../types/whatsapp";

const extensionByMimeType: Record<string, string> = {
  "audio/aac": "aac",
  "audio/amr": "amr",
  "audio/m4a": "m4a",
  "audio/mp3": "mp3",
  "audio/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/opus": "opus",
  "audio/wav": "wav",
  "audio/webm": "webm",
};

const extensionForMimeType = (mimeType: string): string =>
  extensionByMimeType[mimeType.toLowerCase()] ?? "ogg";

export class WhatsAppService {
  private readonly url: string;
  private readonly graphBaseUrl: string;

  constructor(
    private readonly token: string,
    phoneNumberId: string,
    graphVersion: string,
  ) {
    this.graphBaseUrl = `https://graph.facebook.com/${graphVersion}`;
    this.url = `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`;
  }

  async sendTextMessage(to: string, body: string): Promise<void> {
    const response = await fetch(this.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: {
          preview_url: false,
          body,
        },
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(
        `WhatsApp send failed (${response.status}): ${details || "no details"}`,
      );
    }
  }

  async sendAudioMessage(to: string, audioUrl: string): Promise<void> {
    const response = await fetch(this.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "audio",
        audio: {
          link: audioUrl,
        },
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(
        `WhatsApp send audio failed (${response.status}): ${details || "no details"}`,
      );
    }
  }

  async markAsRead(messageId: string): Promise<void> {
    const response = await fetch(this.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(
        `WhatsApp mark as read failed (${response.status}): ${details || "no details"}`,
      );
    }
  }

  async downloadMedia(mediaId: string, mimeTypeHint?: string): Promise<{
    arrayBuffer: ArrayBuffer;
    mimeType: string;
    fileName: string;
  }> {
    const metadataResponse = await fetch(`${this.graphBaseUrl}/${mediaId}`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    });

    if (!metadataResponse.ok) {
      const details = await metadataResponse.text();
      throw new Error(
        `WhatsApp media metadata failed (${metadataResponse.status}): ${details || "no details"}`,
      );
    }

    const metadata = (await metadataResponse.json()) as {
      url?: string;
      mime_type?: string;
    };

    const mediaUrl = metadata.url?.trim();
    if (!mediaUrl) {
      throw new Error("WhatsApp media metadata response did not include a valid url");
    }

    const mediaResponse = await fetch(mediaUrl, {
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    });

    if (!mediaResponse.ok) {
      const details = await mediaResponse.text();
      throw new Error(
        `WhatsApp media download failed (${mediaResponse.status}): ${details || "no details"}`,
      );
    }

    const mimeType =
      metadata.mime_type?.trim() ?? mimeTypeHint ?? "audio/ogg";
    const extension = extensionForMimeType(mimeType);

    return {
      arrayBuffer: await mediaResponse.arrayBuffer(),
      mimeType,
      fileName: `audio-${mediaId}.${extension}`,
    };
  }
}

const pickTextMessage = (message: WhatsAppMessage): string | null => {
  if (message.type !== "text") return null;
  const body = message.text?.body?.trim();
  return body ? body : null;
};

const pickAudioMessage = (
  message: WhatsAppMessage,
): { mediaId: string; mimeType?: string } | null => {
  if (message.type !== "audio") return null;

  const mediaId = message.audio?.id?.trim();
  if (!mediaId) return null;

  return {
    mediaId,
    mimeType: message.audio?.mime_type?.trim(),
  };
};

export const extractInboundMessages = (
  payload: WhatsAppWebhookPayload,
): InboundMessage[] => {
  const inboundMessages: InboundMessage[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const profileNameByWaId = new Map<string, string>();
      for (const contact of change.value?.contacts ?? []) {
        const waId = contact.wa_id?.trim();
        const profileName = contact.profile?.name?.trim();
        if (waId && profileName) {
          profileNameByWaId.set(waId, profileName);
        }
      }

      for (const message of change.value?.messages ?? []) {
        const contactName = profileNameByWaId.get(message.from);
        const text = pickTextMessage(message);
        if (text) {
          inboundMessages.push({
            type: "text",
            from: message.from,
            messageId: message.id,
            text,
            contactName,
          });
          continue;
        }

        const audio = pickAudioMessage(message);
        if (!audio) continue;

        inboundMessages.push({
          type: "audio",
          from: message.from,
          messageId: message.id,
          mediaId: audio.mediaId,
          mimeType: audio.mimeType,
          contactName,
        });
      }
    }
  }

  return inboundMessages;
};
