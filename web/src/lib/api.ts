const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";
const SESSION_TOKEN_KEY = "esports_ia_session_token";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: "ADMIN" | "AGENT";
  createdAt: string;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export interface DashboardOverview {
  totalMessages: number;
  userMessages: number;
  assistantMessages: number;
  totalContacts: number;
}

export interface DashboardConversation {
  phone: string;
  messagesCount: number;
  lastMessageAt: string;
  lastMessagePreview: string;
}

export interface DashboardTurn {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const buildHeaders = (token?: string, hasBody = false): HeadersInit => {
  const headers: HeadersInit = {};
  if (hasBody) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
};

const request = async <T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> => {
  const hasBody = Boolean(options.body);
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...buildHeaders(token, hasBody),
      ...(options.headers ?? {}),
    },
  });

  const raw = await response.text();
  let payload: unknown = null;
  if (raw) {
    try {
      payload = JSON.parse(raw) as unknown;
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof (payload as { error?: unknown }).error === "string"
        ? (payload as { error: string }).error
        : "Erro inesperado na API";
    throw new ApiError(message, response.status);
  }

  return payload as T;
};

export const sessionStore = {
  get(): string | null {
    return window.localStorage.getItem(SESSION_TOKEN_KEY);
  },
  set(token: string): void {
    window.localStorage.setItem(SESSION_TOKEN_KEY, token);
  },
  clear(): void {
    window.localStorage.removeItem(SESSION_TOKEN_KEY);
  },
};

export const api = {
  async login(email: string, password: string): Promise<LoginResponse> {
    return request<LoginResponse>(
      "/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ email, password }),
      },
    );
  },

  async me(token: string): Promise<{ user: AuthUser }> {
    return request<{ user: AuthUser }>("/auth/me", { method: "GET" }, token);
  },

  async overview(token: string): Promise<DashboardOverview> {
    return request<DashboardOverview>("/dashboard/overview", { method: "GET" }, token);
  },

  async conversations(
    token: string,
    limit = 25,
  ): Promise<DashboardConversation[]> {
    return request<DashboardConversation[]>(
      `/dashboard/conversations?limit=${limit}`,
      { method: "GET" },
      token,
    );
  },

  async conversationTurns(
    token: string,
    phone: string,
    limit = 300,
  ): Promise<DashboardTurn[]> {
    return request<DashboardTurn[]>(
      `/dashboard/conversations/${encodeURIComponent(phone)}/turns?limit=${limit}`,
      { method: "GET" },
      token,
    );
  },
};

export { ApiError };
