export type InstagramWebhookPayload = {
  object?: string;
  entry?: InstagramWebhookEntry[];
};

export type InstagramWebhookEntry = {
  id?: string;
  time?: number;
  messaging?: InstagramWebhookMessagingEvent[];
};

export type InstagramWebhookMessagingEvent = {
  sender?: {
    id?: string;
  };
  recipient?: {
    id?: string;
  };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    attachments?: Array<Record<string, unknown>>;
  };
};

export interface InstagramInboundMessage {
  pageId: string;
  from: string;
  to: string;
  messageId: string;
  text: string | null;
  hasAttachments: boolean;
  timestamp: number | null;
}
