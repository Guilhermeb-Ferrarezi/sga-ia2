export interface WhatsAppWebhookPayload {
  object?: string;
  entry?: WhatsAppEntry[];
}

export interface WhatsAppEntry {
  changes?: WhatsAppChange[];
}

export interface WhatsAppChange {
  field?: string;
  value?: WhatsAppValue;
}

export interface WhatsAppValue {
  messaging_product?: string;
  metadata?: {
    phone_number_id?: string;
  };
  contacts?: Array<{
    wa_id?: string;
    profile?: {
      name?: string;
    };
  }>;
  messages?: WhatsAppMessage[];
}

export interface WhatsAppMessage {
  from: string;
  id: string;
  timestamp?: string;
  type?: string;
  text?: {
    body?: string;
  };
  audio?: {
    id?: string;
    mime_type?: string;
  };
  image?: {
    id?: string;
    mime_type?: string;
    caption?: string;
  };
}

export interface InboundTextMessage {
  from: string;
  messageId: string;
  text: string;
  contactName?: string;
}

export interface InboundAudioMessage {
  from: string;
  messageId: string;
  mediaId: string;
  mimeType?: string;
  contactName?: string;
}

export interface InboundImageMessage {
  from: string;
  messageId: string;
  mediaId: string;
  mimeType?: string;
  caption?: string;
  contactName?: string;
}

export type InboundMessage =
  | (InboundTextMessage & { type: "text" })
  | (InboundAudioMessage & { type: "audio" })
  | (InboundImageMessage & { type: "image" });
