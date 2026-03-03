import type {
  InboundTextMessage,
  WhatsAppMessage,
  WhatsAppWebhookPayload,
} from "../types/whatsapp";

export class WhatsAppService {
  private readonly url: string;

  constructor(
    private readonly token: string,
    phoneNumberId: string,
    graphVersion: string,
  ) {
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
}

const pickTextMessage = (message: WhatsAppMessage): string | null => {
  if (message.type !== "text") return null;
  const body = message.text?.body?.trim();
  return body ? body : null;
};

export const extractInboundTextMessages = (
  payload: WhatsAppWebhookPayload,
): InboundTextMessage[] => {
  const inboundMessages: InboundTextMessage[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const message of change.value?.messages ?? []) {
        const text = pickTextMessage(message);
        if (!text) continue;

        inboundMessages.push({
          from: message.from,
          messageId: message.id,
          text,
        });
      }
    }
  }

  return inboundMessages;
};
