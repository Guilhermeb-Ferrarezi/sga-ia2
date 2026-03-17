import type {
  InboundMessage,
  WhatsAppMessage,
  WhatsAppWebhookPayload,
} from "../types/whatsapp";

type WhatsAppGraphErrorPayload = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_data?: {
      messaging_product?: string;
      details?: string;
    };
  };
};

type WhatsAppBusinessProfileApiResponse = {
  data?: Array<{
    about?: string;
    address?: string;
    description?: string;
    email?: string;
    profile_picture_url?: string;
    websites?: string[];
    vertical?: string;
  }>;
};

type WhatsAppPhoneNumberApiResponse = {
  id?: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  name_status?: string;
  code_verification_status?: string;
};

export interface WhatsAppBusinessProfile {
  about: string | null;
  address: string | null;
  description: string | null;
  email: string | null;
  profilePictureUrl: string | null;
  websites: string[];
  vertical: string | null;
}

export interface WhatsAppPhoneNumberProfile {
  id: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  qualityRating: string | null;
  nameStatus: string | null;
  codeVerificationStatus: string | null;
}

export interface UpdateWhatsAppBusinessProfileInput {
  about?: string;
  address?: string;
  description?: string;
  email?: string;
  websites?: string[];
  vertical?: string;
  profilePictureHandle?: string;
}

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

const normalizeOptionalText = (value: string | undefined): string | null => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

const normalizeWebsites = (value: string[] | undefined): string[] =>
  Array.isArray(value)
    ? value
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

export class WhatsAppApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: number,
    readonly details?: string,
  ) {
    super(message);
    this.name = "WhatsAppApiError";
  }
}

const buildWhatsAppApiError = async (
  action: string,
  response: Response,
): Promise<WhatsAppApiError> => {
  const raw = await response.text();
  let parsed: WhatsAppGraphErrorPayload | null = null;

  try {
    parsed = raw ? (JSON.parse(raw) as WhatsAppGraphErrorPayload) : null;
  } catch {
    parsed = null;
  }

  const graphError = parsed?.error;
  const details = graphError?.error_data?.details ?? graphError?.message ?? raw;
  return new WhatsAppApiError(
    `WhatsApp ${action} failed (${response.status}): ${details || "no details"}`,
    response.status,
    graphError?.code,
    details,
  );
};

export const isWhatsAppPermissionError = (error: unknown): boolean =>
  error instanceof WhatsAppApiError && error.code === 10;

export class WhatsAppService {
  private readonly url: string;
  private readonly graphBaseUrl: string;
  private readonly phoneNumberId: string;
  private readonly uploadAppId: string;

  constructor(
    private readonly token: string,
    phoneNumberId: string,
    graphVersion: string,
    uploadAppId?: string,
  ) {
    this.phoneNumberId = phoneNumberId;
    this.graphBaseUrl = `https://graph.facebook.com/${graphVersion}`;
    this.url = `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`;
    this.uploadAppId = uploadAppId?.trim() || "app";
  }

  async getBusinessProfile(): Promise<WhatsAppBusinessProfile> {
    const response = await fetch(
      `${this.graphBaseUrl}/${this.phoneNumberId}/whatsapp_business_profile?fields=about,address,description,email,profile_picture_url,websites,vertical`,
      {
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      },
    );

    if (!response.ok) {
      throw await buildWhatsAppApiError("get business profile", response);
    }

    const payload =
      (await response.json()) as WhatsAppBusinessProfileApiResponse;
    const profile = payload.data?.[0];

    return {
      about: normalizeOptionalText(profile?.about),
      address: normalizeOptionalText(profile?.address),
      description: normalizeOptionalText(profile?.description),
      email: normalizeOptionalText(profile?.email),
      profilePictureUrl: normalizeOptionalText(profile?.profile_picture_url),
      websites: normalizeWebsites(profile?.websites),
      vertical: normalizeOptionalText(profile?.vertical),
    };
  }

  async getPhoneNumberProfile(): Promise<WhatsAppPhoneNumberProfile> {
    const response = await fetch(
      `${this.graphBaseUrl}/${this.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,name_status,code_verification_status`,
      {
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      },
    );

    if (!response.ok) {
      throw await buildWhatsAppApiError("get phone number profile", response);
    }

    const payload = (await response.json()) as WhatsAppPhoneNumberApiResponse;

    return {
      id: this.phoneNumberId,
      displayPhoneNumber: normalizeOptionalText(payload.display_phone_number),
      verifiedName: normalizeOptionalText(payload.verified_name),
      qualityRating: normalizeOptionalText(payload.quality_rating),
      nameStatus: normalizeOptionalText(payload.name_status),
      codeVerificationStatus: normalizeOptionalText(payload.code_verification_status),
    };
  }

  async updateBusinessProfile(
    input: UpdateWhatsAppBusinessProfileInput,
  ): Promise<void> {
    const body: Record<string, unknown> = {
      messaging_product: "whatsapp",
    };

    if ("about" in input) body.about = input.about ?? "";
    if ("address" in input) body.address = input.address ?? "";
    if ("description" in input) body.description = input.description ?? "";
    if ("email" in input) body.email = input.email ?? "";
    if ("vertical" in input) body.vertical = input.vertical ?? "";
    if ("websites" in input) body.websites = input.websites ?? [];
    if (input.profilePictureHandle) {
      body.profile_picture_handle = input.profilePictureHandle;
    }

    const response = await fetch(
      `${this.graphBaseUrl}/${this.phoneNumberId}/whatsapp_business_profile`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      throw await buildWhatsAppApiError("update business profile", response);
    }
  }

  async uploadProfilePicture(
    fileBytes: Uint8Array,
    fileName: string,
    mimeType: string,
  ): Promise<string> {
    const params = new URLSearchParams({
      file_name: fileName,
      file_length: String(fileBytes.byteLength),
      file_type: mimeType,
    });

    const sessionResponse = await fetch(
      `${this.graphBaseUrl}/${this.uploadAppId}/uploads?${params.toString()}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
      },
    );

    if (!sessionResponse.ok) {
      throw await buildWhatsAppApiError("create upload session", sessionResponse);
    }

    const sessionPayload = (await sessionResponse.json()) as { id?: string };
    const uploadId = sessionPayload.id?.trim();
    if (!uploadId) {
      throw new Error("WhatsApp upload session succeeded without returning upload id");
    }

    const uploadBuffer = fileBytes.buffer.slice(
      fileBytes.byteOffset,
      fileBytes.byteOffset + fileBytes.byteLength,
    ) as ArrayBuffer;

    const uploadResponse = await fetch(`${this.graphBaseUrl}/${uploadId}`, {
      method: "POST",
      headers: {
        Authorization: `OAuth ${this.token}`,
        "Content-Type": mimeType,
        file_offset: "0",
      },
      body: new Blob([uploadBuffer], { type: mimeType }),
    });

    if (!uploadResponse.ok) {
      throw await buildWhatsAppApiError("upload profile picture", uploadResponse);
    }

    const uploadPayload = (await uploadResponse.json()) as { h?: string };
    const handle = uploadPayload.h?.trim();
    if (!handle) {
      throw new Error("WhatsApp profile image upload succeeded without returning handle");
    }

    return handle;
  }

  async uploadAudioMedia(
    fileBytes: Uint8Array,
    fileName: string,
    mimeType: string,
  ): Promise<string> {
    const fileBuffer = fileBytes.buffer.slice(
      fileBytes.byteOffset,
      fileBytes.byteOffset + fileBytes.byteLength,
    ) as ArrayBuffer;
    const form = new FormData();
    form.set("messaging_product", "whatsapp");
    form.set(
      "file",
      new File([fileBuffer], fileName, { type: mimeType }),
      fileName,
    );

    const response = await fetch(
      `${this.graphBaseUrl}/${this.phoneNumberId}/media`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
        },
        body: form,
      },
    );

    if (!response.ok) {
      throw await buildWhatsAppApiError("upload media", response);
    }

    const payload = (await response.json()) as { id?: string };
    const mediaId = payload.id?.trim();
    if (!mediaId) {
      throw new Error("WhatsApp media upload succeeded without returning media id");
    }

    return mediaId;
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
      throw await buildWhatsAppApiError("send", response);
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
      throw await buildWhatsAppApiError("send audio", response);
    }
  }

  async sendAudioMessageById(to: string, mediaId: string): Promise<void> {
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
          id: mediaId,
        },
      }),
    });

    if (!response.ok) {
      throw await buildWhatsAppApiError("send audio", response);
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
      throw await buildWhatsAppApiError("mark as read", response);
    }
  }

  /**
   * Show a typing or recording indicator to the user.
   * The indicator auto-dismisses after 25 seconds or when a message is sent.
   * @param type "text" shows "Digitando...", "audio" shows "Gravando áudio..."
   */
  async sendTypingIndicator(
    messageId: string,
    type: "text" | "audio" = "text",
  ): Promise<void> {
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
        typing_indicator: { type },
      }),
    });

    if (!response.ok) {
      // Non-critical — log but don't throw
      const details = await response.text().catch(() => "");
      console.warn(
        `[typing-indicator] failed (${response.status}): ${details}`,
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
