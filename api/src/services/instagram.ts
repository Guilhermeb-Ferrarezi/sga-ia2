import type {
  InstagramInboundMessage,
  InstagramWebhookPayload,
} from "../types/instagram";

type MetaGraphErrorPayload = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    error_user_title?: string;
    error_user_msg?: string;
  };
};

type MetaUserTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  permissions?: string;
  user_id?: string;
};

type MetaAccountsResponse = {
  data?: Array<{
    id?: string;
    name?: string;
    access_token?: string;
    tasks?: string[];
  }>;
};

type MetaPageResponse = {
  id?: string;
  name?: string;
  access_token?: string;
  instagram_business_account?: {
    id?: string;
    username?: string;
  };
};

type InstagramLoginAccountResponse = {
  user_id?: string;
  username?: string;
};

export interface InstagramConnectionSnapshot {
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  instagramAccountId: string;
  instagramUsername: string | null;
  scopes: string[];
  webhookSubscribed: boolean;
}

export class InstagramApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: number,
    readonly details?: string,
  ) {
    super(message);
    this.name = "InstagramApiError";
  }
}

const normalizeOptionalText = (value: string | undefined): string | null => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

const buildInstagramApiError = async (
  action: string,
  response: Response,
): Promise<InstagramApiError> => {
  const raw = await response.text();
  let parsed: MetaGraphErrorPayload | null = null;

  try {
    parsed = raw ? (JSON.parse(raw) as MetaGraphErrorPayload) : null;
  } catch {
    parsed = null;
  }

  const graphError = parsed?.error;
  const details =
    graphError?.error_user_msg ??
    graphError?.error_user_title ??
    graphError?.message ??
    raw;

  return new InstagramApiError(
    `Instagram ${action} failed (${response.status}): ${details || "no details"}`,
    response.status,
    graphError?.code,
    details,
  );
};

const requireValue = (value: string | undefined, name: string): string => {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`Missing required Instagram config: ${name}`);
  }
  return normalized;
};

export class InstagramService {
  private readonly facebookGraphBaseUrl: string;
  private readonly instagramGraphBaseUrl: string;

  constructor(
    graphVersion: string,
    private readonly appId?: string,
    private readonly appSecret?: string,
    private readonly redirectUri?: string,
  ) {
    this.facebookGraphBaseUrl = `https://graph.facebook.com/${graphVersion}`;
    this.instagramGraphBaseUrl = `https://graph.instagram.com/${graphVersion}`;
  }

  isConfigured(): boolean {
    return Boolean(
      this.appId?.trim() &&
        this.appSecret?.trim() &&
        this.redirectUri?.trim(),
    );
  }

  buildOAuthUrl(state: string, scopes: string[]): string {
    const appId = requireValue(this.appId, "INSTAGRAM_APP_ID");
    const redirectUri = requireValue(this.redirectUri, "META_REDIRECT_URI");
    const normalizedScopes = scopes.filter(Boolean);

    if (this.usesInstagramLoginScopes(normalizedScopes)) {
      const params = new URLSearchParams({
        enable_fb_login: "0",
        force_authentication: "1",
        client_id: appId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: normalizedScopes.join(","),
        state,
      });
      return `https://www.instagram.com/oauth/authorize?${params.toString()}`;
    }

    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      response_type: "token",
      display: "page",
      extras: JSON.stringify({
        setup: {
          channel: "IG_API_ONBOARDING",
        },
      }),
      state,
      scope: normalizedScopes.join(","),
    });
    return `https://www.facebook.com/${this.extractFacebookVersionSegment()}/dialog/oauth?${params.toString()}`;
  }

  async exchangeCodeForUserToken(code: string, scopes: string[] = []): Promise<string> {
    const appId = requireValue(this.appId, "INSTAGRAM_APP_ID");
    const appSecret = requireValue(this.appSecret, "INSTAGRAM_APP_SECRET");
    const redirectUri = requireValue(this.redirectUri, "META_REDIRECT_URI");

    if (this.usesInstagramLoginScopes(scopes)) {
      const form = new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code,
      });

      const response = await fetch("https://api.instagram.com/oauth/access_token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
      });

      if (!response.ok) {
        throw await buildInstagramApiError("exchange code", response);
      }

      const payload = (await response.json()) as MetaUserTokenResponse;
      const shortLivedToken = payload.access_token?.trim();
      if (!shortLivedToken) {
        throw new Error("Instagram OAuth did not return an access token");
      }

      return (await this.exchangeForLongLivedInstagramToken(shortLivedToken)) ?? shortLivedToken;
    }

    const params = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code,
    });

    const response = await fetch(
      `${this.facebookGraphBaseUrl}/oauth/access_token?${params.toString()}`,
    );

    if (!response.ok) {
      throw await buildInstagramApiError("exchange code", response);
    }

    const payload = (await response.json()) as MetaUserTokenResponse;
    const token = payload.access_token?.trim();
    if (!token) {
      throw new Error("Instagram OAuth did not return a user access token");
    }
    return token;
  }

  async resolveConnection(
    userAccessToken: string,
    scopes: string[],
  ): Promise<InstagramConnectionSnapshot> {
    const normalizedScopes = scopes.filter(Boolean);
    const strategies = this.usesInstagramLoginScopes(normalizedScopes)
      ? [
          () => this.resolveInstagramLoginConnection(userAccessToken, normalizedScopes),
          () => this.resolveMessengerPageConnection(userAccessToken, normalizedScopes),
        ]
      : [
          () => this.resolveMessengerPageConnection(userAccessToken, normalizedScopes),
          () => this.resolveInstagramLoginConnection(userAccessToken, normalizedScopes),
        ];

    const failures: string[] = [];

    for (const strategy of strategies) {
      try {
        return await strategy();
      } catch (error) {
        failures.push(error instanceof Error ? error.message : "unknown error");
      }
    }

    throw new Error(
      failures[0] ??
        "Nao foi possivel identificar uma conta do Instagram valida para esse token.",
    );
  }

  async getPageAccessToken(
    pageId: string,
    userAccessToken: string,
  ): Promise<string | null> {
    const page = await this.getPage(pageId, userAccessToken);
    return normalizeOptionalText(page.access_token);
  }

  async sendTextMessage(
    pageId: string,
    pageAccessToken: string,
    recipientId: string,
    text: string,
    instagramAccountId?: string | null,
    options?: {
      messagingType?: "RESPONSE" | "MESSAGE_TAG";
      tag?: "HUMAN_AGENT";
    },
  ): Promise<void> {
    const body: Record<string, unknown> = {
      recipient: { id: recipientId },
      message: { text },
      messaging_type: options?.messagingType ?? "RESPONSE",
    };

    if (options?.tag) {
      body.tag = options.tag;
      body.messaging_type = "MESSAGE_TAG";
    }

    const isInstagramLoginConnection =
      Boolean(instagramAccountId?.trim()) && instagramAccountId?.trim() === pageId.trim();
    const endpointBaseUrl = isInstagramLoginConnection
      ? this.instagramGraphBaseUrl
      : this.facebookGraphBaseUrl;
    const targetId = isInstagramLoginConnection
      ? instagramAccountId?.trim() || pageId
      : pageId;

    const response = await fetch(`${endpointBaseUrl}/${targetId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${pageAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw await buildInstagramApiError("send message", response);
    }
  }

  private async getAccounts(
    userAccessToken: string,
  ): Promise<MetaAccountsResponse["data"]> {
    const response = await fetch(
      `${this.facebookGraphBaseUrl}/me/accounts?fields=id,name,access_token,tasks`,
      {
        headers: {
          Authorization: `Bearer ${userAccessToken}`,
        },
      },
    );

    if (!response.ok) {
      throw await buildInstagramApiError("list pages", response);
    }

    const payload = (await response.json()) as MetaAccountsResponse;
    return payload.data ?? [];
  }

  private async getPage(
    pageId: string,
    accessToken: string,
  ): Promise<MetaPageResponse> {
    const response = await fetch(
      `${this.facebookGraphBaseUrl}/${pageId}?fields=id,name,access_token,instagram_business_account{id,username}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!response.ok) {
      throw await buildInstagramApiError("read page", response);
    }

    return (await response.json()) as MetaPageResponse;
  }

  private async subscribePageToMessages(
    pageId: string,
    pageAccessToken: string,
  ): Promise<boolean> {
    const params = new URLSearchParams({
      subscribed_fields: "messages",
      access_token: pageAccessToken,
    });

    const response = await fetch(
      `${this.facebookGraphBaseUrl}/${pageId}/subscribed_apps?${params.toString()}`,
      {
        method: "POST",
      },
    );

    if (!response.ok) {
      throw await buildInstagramApiError("subscribe webhook", response);
    }

    return true;
  }

  private async resolveMessengerPageConnection(
    userAccessToken: string,
    scopes: string[],
  ): Promise<InstagramConnectionSnapshot> {
    const pages = (await this.getAccounts(userAccessToken)) ?? [];
    if (!pages.length) {
      throw new Error("Nenhuma pagina do Facebook foi encontrada para esse usuario.");
    }

    for (const page of pages) {
      const pageId = page.id?.trim();
      if (!pageId) continue;

      const pageDetails = await this.getPage(pageId, userAccessToken);
      const instagramAccountId = pageDetails.instagram_business_account?.id?.trim();
      if (!instagramAccountId) continue;

      const pageAccessToken =
        normalizeOptionalText(page.access_token) ??
        normalizeOptionalText(pageDetails.access_token) ??
        (await this.getPageAccessToken(pageId, userAccessToken));

      if (!pageAccessToken) {
        throw new Error(
          `A pagina ${pageDetails.name ?? pageId} nao retornou page access token.`,
        );
      }

      const webhookSubscribed = await this.subscribePageToMessages(
        pageId,
        pageAccessToken,
      );

      return {
        pageId,
        pageName: pageDetails.name?.trim() || page.name?.trim() || pageId,
        pageAccessToken,
        instagramAccountId,
        instagramUsername: normalizeOptionalText(
          pageDetails.instagram_business_account?.username,
        ),
        scopes,
        webhookSubscribed,
      };
    }

    throw new Error(
      "Nenhuma pagina vinculada a uma conta Instagram profissional foi encontrada.",
    );
  }

  private async resolveInstagramLoginConnection(
    userAccessToken: string,
    scopes: string[],
  ): Promise<InstagramConnectionSnapshot> {
    const account = await this.getInstagramLoginAccount(userAccessToken);
    const instagramAccountId = account.user_id?.trim();
    if (!instagramAccountId) {
      throw new Error("Esse token nao retornou um Instagram user ID valido.");
    }

    const instagramUsername = normalizeOptionalText(account.username);
    const webhookSubscribed =
      await this.subscribeInstagramLoginAccountToMessages(userAccessToken);

    return {
      pageId: instagramAccountId,
      pageName: instagramUsername ? `@${instagramUsername}` : instagramAccountId,
      pageAccessToken: userAccessToken,
      instagramAccountId,
      instagramUsername,
      scopes,
      webhookSubscribed,
    };
  }

  private async getInstagramLoginAccount(
    userAccessToken: string,
  ): Promise<InstagramLoginAccountResponse> {
    const params = new URLSearchParams({
      fields: "user_id,username",
      access_token: userAccessToken,
    });
    const response = await fetch(`${this.instagramGraphBaseUrl}/me?${params.toString()}`);

    if (!response.ok) {
      throw await buildInstagramApiError("read instagram account", response);
    }

    return (await response.json()) as InstagramLoginAccountResponse;
  }

  private async subscribeInstagramLoginAccountToMessages(
    userAccessToken: string,
  ): Promise<boolean> {
    const params = new URLSearchParams({
      subscribed_fields: "messages",
      access_token: userAccessToken,
    });

    const response = await fetch(
      `${this.instagramGraphBaseUrl}/me/subscribed_apps?${params.toString()}`,
      {
        method: "POST",
      },
    );

    if (!response.ok) {
      throw await buildInstagramApiError("subscribe webhook", response);
    }

    return true;
  }

  private async exchangeForLongLivedInstagramToken(
    shortLivedToken: string,
  ): Promise<string | null> {
    const appSecret = requireValue(this.appSecret, "INSTAGRAM_APP_SECRET");
    const params = new URLSearchParams({
      grant_type: "ig_exchange_token",
      client_secret: appSecret,
      access_token: shortLivedToken,
    });

    const response = await fetch(
      `${this.instagramGraphBaseUrl}/access_token?${params.toString()}`,
    );

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as MetaUserTokenResponse;
    return normalizeOptionalText(payload.access_token);
  }

  private usesInstagramLoginScopes(scopes: string[]): boolean {
    return scopes.some((scope) => scope.startsWith("instagram_business_"));
  }

  private extractFacebookVersionSegment(): string {
    const parts = this.facebookGraphBaseUrl.split("/");
    return parts[parts.length - 1] || "v25.0";
  }
}

export const extractInstagramInboundMessages = (
  payload: InstagramWebhookPayload,
): InstagramInboundMessage[] => {
  const inbound: InstagramInboundMessage[] = [];

  for (const entry of payload.entry ?? []) {
    const pageId = entry.id?.trim();
    if (!pageId) continue;

    for (const event of entry.messaging ?? []) {
      const senderId = event.sender?.id?.trim();
      const recipientId = event.recipient?.id?.trim();
      const messageId = event.message?.mid?.trim();
      const isEcho = event.message?.is_echo === true;

      if (!senderId || !recipientId || !messageId || isEcho) continue;

      const text = normalizeOptionalText(event.message?.text);
      const attachments = (event.message?.attachments ?? [])
        .map((attachment) => ({
          type: normalizeOptionalText(attachment.type),
          url: normalizeOptionalText(attachment.payload?.url),
          title: normalizeOptionalText(attachment.payload?.title),
        }))
        .filter(
          (attachment) => attachment.type || attachment.url || attachment.title,
        );
      const hasAttachments = attachments.length > 0;

      inbound.push({
        pageId,
        from: senderId,
        to: recipientId,
        messageId,
        text,
        hasAttachments,
        attachments,
        timestamp: typeof event.timestamp === "number" ? event.timestamp : null,
      });
    }
  }

  return inbound;
};
