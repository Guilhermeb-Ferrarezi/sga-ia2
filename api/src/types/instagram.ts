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
    attachments?: InstagramWebhookAttachment[];
  };
};

export type InstagramWebhookAttachment = {
  type?: string;
  payload?: {
    url?: string;
    title?: string;
  } & Record<string, unknown>;
};

export interface InstagramInboundAttachment {
  type: string | null;
  url: string | null;
  title: string | null;
}

export interface InstagramInboundMessage {
  pageId: string;
  from: string;
  to: string;
  messageId: string;
  text: string | null;
  hasAttachments: boolean;
  attachments: InstagramInboundAttachment[];
  timestamp: number | null;
}
