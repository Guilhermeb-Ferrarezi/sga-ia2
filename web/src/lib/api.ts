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
  name: string | null;
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

// ── Phase 2 types ──────────────────────────────────────────────────

export interface PipelineStage {
  id: number;
  name: string;
  position: number;
  color: string;
  isActive: boolean;
}

export interface ContactTag {
  id: number;
  contactId: number;
  tagId: number;
  tag: Tag;
}

export interface Tag {
  id: number;
  name: string;
  color: string;
}

export interface PipelineContact {
  id: number;
  waId: string;
  name: string | null;
  email?: string | null;
  tournament?: string | null;
  eventDate?: string | null;
  category?: string | null;
  city?: string | null;
  teamName?: string | null;
  playersCount?: number | null;
  stageId: number | null;
  leadStatus: "open" | "won" | "lost" | string;
  triageCompleted?: boolean;
  handoffRequested?: boolean;
  handoffReason?: string | null;
  handoffAt?: string | null;
  source: string | null;
  notes: string | null;
  age: string | null;
  level: string | null;
  objective: string | null;
  botEnabled: boolean;
  lastInteractionAt: string | null;
  createdAt: string;
  tags: ContactTag[];
  messages: Array<{ body: string; createdAt: string }>;
}

export interface PipelineBoard {
  stages: Array<PipelineStage & { contacts: PipelineContact[] }>;
  unassigned: PipelineContact[];
}

export interface Faq {
  id: number;
  question: string;
  answer: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MessageTemplate {
  id: number;
  title: string;
  body: string;
  category: string;
  createdAt: string;
  updatedAt: string;
}

export interface Audio {
  id: number;
  title: string;
  filename: string;
  r2Key: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  category: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface ContactUpdateInput {
  name?: string | null;
  email?: string | null;
  tournament?: string | null;
  eventDate?: string | null;
  category?: string | null;
  city?: string | null;
  teamName?: string | null;
  playersCount?: number | null;
  source?: string | null;
  notes?: string | null;
  age?: string | null;
  level?: string | null;
  objective?: string | null;
  triageCompleted?: boolean;
  handoffRequested?: boolean;
  handoffReason?: string | null;
  handoffAt?: string | null;
  botEnabled?: boolean;
  leadStatus?: "open" | "won" | "lost";
  stageId?: number | null;
}

export interface ContactCreateInput {
  waId: string;
  name?: string | null;
  email?: string | null;
  tournament?: string | null;
  eventDate?: string | null;
  category?: string | null;
  city?: string | null;
  teamName?: string | null;
  playersCount?: number | null;
  source?: string | null;
  notes?: string | null;
  age?: string | null;
  level?: string | null;
  objective?: string | null;
  triageCompleted?: boolean;
  handoffRequested?: boolean;
  handoffReason?: string | null;
  handoffAt?: string | null;
  botEnabled?: boolean;
  leadStatus?: "open" | "won" | "lost";
  stageId?: number | null;
}

export type TaskStatus = "open" | "in_progress" | "done" | "cancelled";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export interface Task {
  id: number;
  contactId: number;
  title: string;
  description: string | null;
  dueAt: string;
  status: TaskStatus | string;
  priority: TaskPriority | string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  contact: {
    id: number;
    waId: string;
    name: string | null;
  };
}

export interface OperationalAlertsSummary {
  overdueTasks: number;
  pendingHandoffs: number;
  criticalHandoffs: number;
  updatedAt: string;
}

export type HandoffSlaLevel = "ok" | "warning" | "critical";

export interface HandoffQueueItem {
  waId: string;
  name: string | null;
  stage: {
    id: number;
    name: string;
    color: string;
  } | null;
  handoffReason: string | null;
  handoffAt: string | null;
  waitMinutes: number;
  slaLevel: HandoffSlaLevel;
  assignedTo: string | null;
  assignedAt: string | null;
  latestMessage: {
    body: string;
    createdAt: string;
  } | null;
  openTasks: Array<{
    id: number;
    title: string;
    dueAt: string;
    status: string;
    priority: string;
  }>;
}

export interface AuditLogEntry {
  id: number;
  action: string;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
  user: { name: string | null; email: string } | null;
}

export interface FunnelStageMetric {
  stageId: number;
  stageName: string;
  total: number;
  won: number;
  lost: number;
  conversionRate: number;
  avgHoursInStage: number | null;
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

export const getWsUrl = (token: string): string => {
  // In dev, the vite proxy doesn't handle WS well so connect directly
  const wsBase = import.meta.env.DEV
    ? `ws://${window.location.hostname}:5000/api`
    : (() => {
        const normalizedApiBase = API_BASE.startsWith("http")
          ? API_BASE
          : new URL(API_BASE, window.location.origin).toString();
        const apiUrl = new URL(normalizedApiBase);
        const wsProtocol = apiUrl.protocol === "https:" ? "wss:" : "ws:";
        const path = apiUrl.pathname.replace(/\/+$/, "");
        return `${wsProtocol}//${apiUrl.host}${path}`;
      })();
  return `${wsBase}/ws?token=${encodeURIComponent(token)}`;
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

  async alertsSummary(token: string): Promise<OperationalAlertsSummary> {
    return request<OperationalAlertsSummary>("/dashboard/alerts", { method: "GET" }, token);
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

  // ── Pipeline ───────────────────────────────────────────────

  async pipelineStages(token: string): Promise<PipelineStage[]> {
    return request<PipelineStage[]>("/pipeline/stages", { method: "GET" }, token);
  },

  async createPipelineStage(
    token: string,
    data: { name: string; color?: string; isActive?: boolean },
  ): Promise<PipelineStage> {
    return request<PipelineStage>(
      "/pipeline/stages",
      { method: "POST", body: JSON.stringify(data) },
      token,
    );
  },

  async updatePipelineStage(
    token: string,
    id: number,
    data: Partial<{ name: string; color: string; isActive: boolean }>,
  ): Promise<PipelineStage> {
    return request<PipelineStage>(
      `/pipeline/stages/${id}`,
      { method: "PUT", body: JSON.stringify(data) },
      token,
    );
  },

  async deletePipelineStage(token: string, id: number): Promise<void> {
    await request(`/pipeline/stages/${id}`, { method: "DELETE" }, token);
  },

  async reorderPipelineStages(token: string, stageIds: number[]): Promise<void> {
    await request(
      "/pipeline/stages/reorder",
      { method: "POST", body: JSON.stringify({ stageIds }) },
      token,
    );
  },

  async pipelineBoard(token: string): Promise<PipelineBoard> {
    return request<PipelineBoard>("/pipeline/board", { method: "GET" }, token);
  },

  async funnelMetrics(token: string): Promise<FunnelStageMetric[]> {
    return request<FunnelStageMetric[]>("/pipeline/funnel", { method: "GET" }, token);
  },

  async createContact(
    token: string,
    data: ContactCreateInput,
  ): Promise<PipelineContact> {
    return request<PipelineContact>(
      "/contacts",
      { method: "POST", body: JSON.stringify(data) },
      token,
    );
  },

  async updateContactStage(
    token: string,
    waId: string,
    stageId: number | null,
  ): Promise<unknown> {
    return request(
      `/contacts/${encodeURIComponent(waId)}/stage`,
      { method: "PUT", body: JSON.stringify({ stageId }) },
      token,
    );
  },

  async updateContact(
    token: string,
    waId: string,
    data: ContactUpdateInput,
  ): Promise<PipelineContact> {
    return request<PipelineContact>(
      `/contacts/${encodeURIComponent(waId)}`,
      { method: "PUT", body: JSON.stringify(data) },
      token,
    );
  },

  async updateContactLeadStatus(
    token: string,
    waId: string,
    leadStatus: "open" | "won" | "lost",
  ): Promise<unknown> {
    return request(
      `/contacts/${encodeURIComponent(waId)}/status`,
      { method: "PUT", body: JSON.stringify({ leadStatus }) },
      token,
    );
  },

  async deleteContact(token: string, waId: string): Promise<void> {
    await request(`/contacts/${encodeURIComponent(waId)}`, { method: "DELETE" }, token);
  },

  // ── Batch actions ──────────────────────────────────────────

  async batchContacts(
    token: string,
    waIds: string[],
    action: string,
    extra?: Record<string, unknown>,
  ): Promise<{ ok: boolean; updated: number }> {
    return request<{ ok: boolean; updated: number }>(
      "/contacts/batch",
      { method: "POST", body: JSON.stringify({ waIds, action, ...extra }) },
      token,
    );
  },

  // ── Audit log ───────────────────────────────────────────────

  async contactAuditLog(token: string, waId: string): Promise<AuditLogEntry[]> {
    return request<AuditLogEntry[]>(
      `/contacts/${encodeURIComponent(waId)}/audit`,
      { method: "GET" },
      token,
    );
  },

  // ── Bot toggle ─────────────────────────────────────────────

  async toggleBot(
    token: string,
    waId: string,
    botEnabled: boolean,
  ): Promise<PipelineContact> {
    return request<PipelineContact>(
      `/contacts/${encodeURIComponent(waId)}/bot`,
      { method: "PUT", body: JSON.stringify({ botEnabled }) },
      token,
    );
  },

  // ── Human chat ─────────────────────────────────────────────

  async sendMessage(
    token: string,
    waId: string,
    message: string,
  ): Promise<unknown> {
    return request(
      `/contacts/${encodeURIComponent(waId)}/send`,
      { method: "POST", body: JSON.stringify({ message }) },
      token,
    );
  },

  // ── FAQs ───────────────────────────────────────────────────

  async faqs(
    token: string,
    filters?: { limit?: number; offset?: number; search?: string; isActive?: boolean | null },
  ): Promise<PaginatedResult<Faq>> {
    const params = new URLSearchParams();
    if (typeof filters?.limit === "number") params.set("limit", String(filters.limit));
    if (typeof filters?.offset === "number") params.set("offset", String(filters.offset));
    if (filters?.search) params.set("search", filters.search);
    if (filters?.isActive === true) params.set("isActive", "true");
    if (filters?.isActive === false) params.set("isActive", "false");
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return request<PaginatedResult<Faq>>(`/faqs${suffix}`, { method: "GET" }, token);
  },

  async createFaq(
    token: string,
    data: { question: string; answer: string; isActive?: boolean },
  ): Promise<Faq> {
    return request<Faq>(
      "/faqs",
      { method: "POST", body: JSON.stringify(data) },
      token,
    );
  },

  async updateFaq(
    token: string,
    id: number,
    data: Partial<{ question: string; answer: string; isActive: boolean }>,
  ): Promise<Faq> {
    return request<Faq>(
      `/faqs/${id}`,
      { method: "PUT", body: JSON.stringify(data) },
      token,
    );
  },

  async deleteFaq(token: string, id: number): Promise<void> {
    await request(`/faqs/${id}`, { method: "DELETE" }, token);
  },

  // ── Templates ──────────────────────────────────────────────

  async templates(
    token: string,
    filters?: { limit?: number; offset?: number; search?: string; category?: string },
  ): Promise<PaginatedResult<MessageTemplate>> {
    const params = new URLSearchParams();
    if (typeof filters?.limit === "number") params.set("limit", String(filters.limit));
    if (typeof filters?.offset === "number") params.set("offset", String(filters.offset));
    if (filters?.search) params.set("search", filters.search);
    if (filters?.category) params.set("category", filters.category);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return request<PaginatedResult<MessageTemplate>>(
      `/templates${suffix}`,
      { method: "GET" },
      token,
    );
  },

  async createTemplate(
    token: string,
    data: { title: string; body: string; category?: string },
  ): Promise<MessageTemplate> {
    return request<MessageTemplate>(
      "/templates",
      { method: "POST", body: JSON.stringify(data) },
      token,
    );
  },

  async updateTemplate(
    token: string,
    id: number,
    data: Partial<{ title: string; body: string; category: string }>,
  ): Promise<MessageTemplate> {
    return request<MessageTemplate>(
      `/templates/${id}`,
      { method: "PUT", body: JSON.stringify(data) },
      token,
    );
  },

  async deleteTemplate(token: string, id: number): Promise<void> {
    await request(`/templates/${id}`, { method: "DELETE" }, token);
  },
  // ── Audios ──────────────────────────────────────────────

  async audios(
    token: string,
    filters?: { limit?: number; offset?: number; search?: string; category?: string },
  ): Promise<PaginatedResult<Audio>> {
    const params = new URLSearchParams();
    if (typeof filters?.limit === "number") params.set("limit", String(filters.limit));
    if (typeof filters?.offset === "number") params.set("offset", String(filters.offset));
    if (filters?.search) params.set("search", filters.search);
    if (filters?.category) params.set("category", filters.category);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return request<PaginatedResult<Audio>>(`/audios${suffix}`, { method: "GET" }, token);
  },

  async uploadAudio(
    token: string,
    file: File,
    meta?: { title?: string; category?: string },
  ): Promise<Audio> {
    const formData = new FormData();
    formData.append("file", file);
    if (meta?.title) formData.append("title", meta.title);
    if (meta?.category) formData.append("category", meta.category);

    const response = await fetch(`${API_BASE}/audios`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

    const raw = await response.text();
    let payload: unknown = null;
    if (raw) {
      try { payload = JSON.parse(raw); } catch { payload = null; }
    }
    if (!response.ok) {
      const message =
        typeof payload === "object" && payload !== null && "error" in payload &&
        typeof (payload as { error?: unknown }).error === "string"
          ? (payload as { error: string }).error
          : "Erro ao enviar audio";
      throw new ApiError(message, response.status);
    }
    return payload as Audio;
  },

  async updateAudio(
    token: string,
    id: number,
    data: Partial<{ title: string; category: string }>,
  ): Promise<Audio> {
    return request<Audio>(
      `/audios/${id}`,
      { method: "PUT", body: JSON.stringify(data) },
      token,
    );
  },

  async deleteAudio(token: string, id: number): Promise<void> {
    await request(`/audios/${id}`, { method: "DELETE" }, token);
  },
  // ── Tags ───────────────────────────────────────────────────

  async tags(
    token: string,
    filters?: { limit?: number; offset?: number; search?: string },
  ): Promise<PaginatedResult<Tag>> {
    const params = new URLSearchParams();
    if (typeof filters?.limit === "number") params.set("limit", String(filters.limit));
    if (typeof filters?.offset === "number") params.set("offset", String(filters.offset));
    if (filters?.search) params.set("search", filters.search);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return request<PaginatedResult<Tag>>(`/tags${suffix}`, { method: "GET" }, token);
  },

  async updateTag(
    token: string,
    id: number,
    data: Partial<{ name: string; color: string }>,
  ): Promise<Tag> {
    return request<Tag>(
      `/tags/${id}`,
      { method: "PUT", body: JSON.stringify(data) },
      token,
    );
  },

  async createTag(
    token: string,
    data: { name: string; color?: string },
  ): Promise<Tag> {
    return request<Tag>(
      "/tags",
      { method: "POST", body: JSON.stringify(data) },
      token,
    );
  },

  async deleteTag(token: string, id: number): Promise<void> {
    await request(`/tags/${id}`, { method: "DELETE" }, token);
  },

  async addContactTag(
    token: string,
    waId: string,
    tagId: number,
  ): Promise<unknown> {
    return request(
      `/contacts/${encodeURIComponent(waId)}/tags`,
      { method: "POST", body: JSON.stringify({ tagId }) },
      token,
    );
  },

  async removeContactTag(
    token: string,
    waId: string,
    tagId: number,
  ): Promise<void> {
    await request(
      `/contacts/${encodeURIComponent(waId)}/tags/${tagId}`,
      { method: "DELETE" },
      token,
    );
  },

  async handoffQueue(
    token: string,
    options?: { onlyMine?: boolean },
  ): Promise<HandoffQueueItem[]> {
    const params = new URLSearchParams();
    if (options?.onlyMine) params.set("onlyMine", "1");
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return request<HandoffQueueItem[]>(`/handoff/queue${suffix}`, { method: "GET" }, token);
  },

  async assignHandoff(
    token: string,
    waId: string,
    owner?: string | null,
  ): Promise<{ waId: string; assignedTo: string | null; assignedAt: string | null }> {
    return request(
      `/handoff/queue/${encodeURIComponent(waId)}/assign`,
      { method: "PUT", body: JSON.stringify({ owner: owner ?? null }) },
      token,
    );
  },

  async tasks(
    token: string,
    filters?: {
      waId?: string;
      status?: TaskStatus | "";
      priority?: TaskPriority | "";
      contactId?: number;
    },
  ): Promise<Task[]> {
    const params = new URLSearchParams();
    if (filters?.waId) params.set("waId", filters.waId);
    if (filters?.status) params.set("status", filters.status);
    if (filters?.priority) params.set("priority", filters.priority);
    if (typeof filters?.contactId === "number") {
      params.set("contactId", String(filters.contactId));
    }
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return request<Task[]>(`/tasks${suffix}`, { method: "GET" }, token);
  },

  async createTask(
    token: string,
    data: {
      waId: string;
      title: string;
      description?: string;
      dueAt: string;
      status?: TaskStatus;
      priority?: TaskPriority;
    },
  ): Promise<Task> {
    return request<Task>(
      "/tasks",
      { method: "POST", body: JSON.stringify(data) },
      token,
    );
  },

  async updateTask(
    token: string,
    id: number,
    data: Partial<{
      title: string;
      description: string | null;
      dueAt: string;
      status: TaskStatus;
      priority: TaskPriority;
      waId: string;
      contactId: number;
    }>,
  ): Promise<Task> {
    return request<Task>(
      `/tasks/${id}`,
      { method: "PUT", body: JSON.stringify(data) },
      token,
    );
  },

  async deleteTask(token: string, id: number): Promise<void> {
    await request(`/tasks/${id}`, { method: "DELETE" }, token);
  },
};

export { ApiError };
