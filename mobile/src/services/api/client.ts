import axios, { type AxiosInstance } from "axios";
import { ENV } from "@/utils/env";
import { tokenStorage } from "@/services/storage/tokenStorage";
import type {
  Audio,
  AuditLogEntry,
  AuthUser,
  ContactCreateInput,
  ContactUpdateInput,
  CreateUserInput,
  DashboardConversation,
  DashboardOverview,
  DashboardTurn,
  Faq,
  FunnelStageMetric,
  HandoffQueueItem,
  LoginResponse,
  MessageTemplate,
  OperationalAlertsSummary,
  PaginatedResult,
  PipelineBoard,
  PipelineContact,
  PipelineStage,
  Tag,
  Task,
  TaskPriority,
  TaskStatus,
} from "@/types";

// ── Axios instance ──────────────────────────────────────────────────

const http: AxiosInstance = axios.create({
  baseURL: ENV.API_BASE,
  headers: { "Content-Type": "application/json" },
  timeout: 15_000,
});

// Attach token to every request
http.interceptors.request.use(async (config) => {
  const token = await tokenStorage.get();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Helpers ─────────────────────────────────────────────────────────

function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") sp.set(k, String(v));
  }
  const str = sp.toString();
  return str ? `?${str}` : "";
}

// ── API methods ──────────────────────────────────────────────────────

export const api = {
  // ── Auth ──────────────────────────────────────────────────

  async login(email: string, password: string): Promise<LoginResponse> {
    const { data } = await http.post<LoginResponse>("/auth/login", {
      email,
      password,
    });
    return data;
  },

  async me(): Promise<{ user: AuthUser }> {
    const { data } = await http.get<{ user: AuthUser }>("/auth/me");
    return data;
  },

  async createUser(input: CreateUserInput): Promise<AuthUser> {
    const { data } = await http.post<AuthUser>("/users", input);
    return data;
  },

  // ── Dashboard ─────────────────────────────────────────────

  async overview(): Promise<DashboardOverview> {
    const { data } = await http.get<DashboardOverview>("/dashboard/overview");
    return data;
  },

  async alertsSummary(): Promise<OperationalAlertsSummary> {
    const { data } = await http.get<OperationalAlertsSummary>(
      "/dashboard/alerts",
    );
    return data;
  },

  async conversations(limit = 25): Promise<DashboardConversation[]> {
    const { data } = await http.get<DashboardConversation[]>(
      `/dashboard/conversations${qs({ limit })}`,
    );
    return data;
  },

  async conversationTurns(
    phone: string,
    limit = 300,
  ): Promise<DashboardTurn[]> {
    const { data } = await http.get<DashboardTurn[]>(
      `/dashboard/conversations/${encodeURIComponent(phone)}/turns${qs({ limit })}`,
    );
    return data;
  },

  // ── Pipeline ──────────────────────────────────────────────

  async pipelineStages(): Promise<PipelineStage[]> {
    const { data } = await http.get<PipelineStage[]>("/pipeline/stages");
    return data;
  },

  async createPipelineStage(
    input: { name: string; color?: string; isActive?: boolean },
  ): Promise<PipelineStage> {
    const { data } = await http.post<PipelineStage>("/pipeline/stages", input);
    return data;
  },

  async updatePipelineStage(
    id: number,
    input: Partial<{ name: string; color: string; isActive: boolean }>,
  ): Promise<PipelineStage> {
    const { data } = await http.put<PipelineStage>(
      `/pipeline/stages/${id}`,
      input,
    );
    return data;
  },

  async deletePipelineStage(id: number): Promise<void> {
    await http.delete(`/pipeline/stages/${id}`);
  },

  async reorderPipelineStages(stageIds: number[]): Promise<void> {
    await http.post("/pipeline/stages/reorder", { stageIds });
  },

  async pipelineBoard(): Promise<PipelineBoard> {
    const { data } = await http.get<PipelineBoard>("/pipeline/board");
    return data;
  },

  async funnelMetrics(): Promise<FunnelStageMetric[]> {
    const { data } = await http.get<FunnelStageMetric[]>("/pipeline/funnel");
    return data;
  },

  // ── Contacts ──────────────────────────────────────────────

  async createContact(input: ContactCreateInput): Promise<PipelineContact> {
    const { data } = await http.post<PipelineContact>("/contacts", input);
    return data;
  },

  async updateContactStage(
    waId: string,
    stageId: number | null,
  ): Promise<unknown> {
    const { data } = await http.put(
      `/contacts/${encodeURIComponent(waId)}/stage`,
      { stageId },
    );
    return data;
  },

  async updateContact(
    waId: string,
    input: ContactUpdateInput,
  ): Promise<PipelineContact> {
    const { data } = await http.put<PipelineContact>(
      `/contacts/${encodeURIComponent(waId)}`,
      input,
    );
    return data;
  },

  async updateContactLeadStatus(
    waId: string,
    leadStatus: "open" | "won" | "lost",
  ): Promise<unknown> {
    const { data } = await http.put(
      `/contacts/${encodeURIComponent(waId)}/status`,
      { leadStatus },
    );
    return data;
  },

  async deleteContact(waId: string): Promise<void> {
    await http.delete(`/contacts/${encodeURIComponent(waId)}`);
  },

  // ── Batch actions ─────────────────────────────────────────

  async batchContacts(
    waIds: string[],
    action: string,
    extra?: Record<string, unknown>,
  ): Promise<{ ok: boolean; updated: number }> {
    const { data } = await http.post<{ ok: boolean; updated: number }>(
      "/contacts/batch",
      { waIds, action, ...extra },
    );
    return data;
  },

  // ── Audit log ──────────────────────────────────────────────

  async contactAuditLog(waId: string): Promise<AuditLogEntry[]> {
    const { data } = await http.get<AuditLogEntry[]>(
      `/contacts/${encodeURIComponent(waId)}/audit`,
    );
    return data;
  },

  // ── Bot toggle ─────────────────────────────────────────────

  async toggleBot(
    waId: string,
    botEnabled: boolean,
  ): Promise<PipelineContact> {
    const { data } = await http.put<PipelineContact>(
      `/contacts/${encodeURIComponent(waId)}/bot`,
      { botEnabled },
    );
    return data;
  },

  // ── Human chat ─────────────────────────────────────────────

  async sendMessage(waId: string, message: string): Promise<unknown> {
    const { data } = await http.post(
      `/contacts/${encodeURIComponent(waId)}/send`,
      { message },
    );
    return data;
  },

  // ── FAQs ───────────────────────────────────────────────────

  async faqs(
    filters?: {
      limit?: number;
      offset?: number;
      search?: string;
      isActive?: boolean | null;
    },
  ): Promise<PaginatedResult<Faq>> {
    const { data } = await http.get<PaginatedResult<Faq>>(
      `/faqs${qs({
        limit: filters?.limit,
        offset: filters?.offset,
        search: filters?.search,
        isActive: filters?.isActive,
      })}`,
    );
    return data;
  },

  async createFaq(
    input: { question: string; answer: string; isActive?: boolean },
  ): Promise<Faq> {
    const { data } = await http.post<Faq>("/faqs", input);
    return data;
  },

  async updateFaq(
    id: number,
    input: Partial<{ question: string; answer: string; isActive: boolean }>,
  ): Promise<Faq> {
    const { data } = await http.put<Faq>(`/faqs/${id}`, input);
    return data;
  },

  async deleteFaq(id: number): Promise<void> {
    await http.delete(`/faqs/${id}`);
  },

  // ── Templates ──────────────────────────────────────────────

  async templates(
    filters?: {
      limit?: number;
      offset?: number;
      search?: string;
      category?: string;
    },
  ): Promise<PaginatedResult<MessageTemplate>> {
    const { data } = await http.get<PaginatedResult<MessageTemplate>>(
      `/templates${qs({
        limit: filters?.limit,
        offset: filters?.offset,
        search: filters?.search,
        category: filters?.category,
      })}`,
    );
    return data;
  },

  async createTemplate(
    input: { title: string; body: string; category?: string },
  ): Promise<MessageTemplate> {
    const { data } = await http.post<MessageTemplate>("/templates", input);
    return data;
  },

  async updateTemplate(
    id: number,
    input: Partial<{ title: string; body: string; category: string }>,
  ): Promise<MessageTemplate> {
    const { data } = await http.put<MessageTemplate>(
      `/templates/${id}`,
      input,
    );
    return data;
  },

  async deleteTemplate(id: number): Promise<void> {
    await http.delete(`/templates/${id}`);
  },

  // ── Audios ─────────────────────────────────────────────────

  async audios(
    filters?: {
      limit?: number;
      offset?: number;
      search?: string;
      category?: string;
    },
  ): Promise<PaginatedResult<Audio>> {
    const { data } = await http.get<PaginatedResult<Audio>>(
      `/audios${qs({
        limit: filters?.limit,
        offset: filters?.offset,
        search: filters?.search,
        category: filters?.category,
      })}`,
    );
    return data;
  },

  async uploadAudio(
    fileUri: string,
    fileName: string,
    mimeType: string,
    meta?: { title?: string; category?: string },
  ): Promise<Audio> {
    const formData = new FormData();
    formData.append("file", {
      uri: fileUri,
      name: fileName,
      type: mimeType,
    } as unknown as Blob);
    if (meta?.title) formData.append("title", meta.title);
    if (meta?.category) formData.append("category", meta.category);

    const { data } = await http.post<Audio>("/audios", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  },

  async updateAudio(
    id: number,
    input: Partial<{ title: string; category: string }>,
  ): Promise<Audio> {
    const { data } = await http.put<Audio>(`/audios/${id}`, input);
    return data;
  },

  async deleteAudio(id: number): Promise<void> {
    await http.delete(`/audios/${id}`);
  },

  // ── Tags ───────────────────────────────────────────────────

  async tags(
    filters?: { limit?: number; offset?: number; search?: string },
  ): Promise<PaginatedResult<Tag>> {
    const { data } = await http.get<PaginatedResult<Tag>>(
      `/tags${qs({
        limit: filters?.limit,
        offset: filters?.offset,
        search: filters?.search,
      })}`,
    );
    return data;
  },

  async createTag(
    input: { name: string; color?: string },
  ): Promise<Tag> {
    const { data } = await http.post<Tag>("/tags", input);
    return data;
  },

  async updateTag(
    id: number,
    input: Partial<{ name: string; color: string }>,
  ): Promise<Tag> {
    const { data } = await http.put<Tag>(`/tags/${id}`, input);
    return data;
  },

  async deleteTag(id: number): Promise<void> {
    await http.delete(`/tags/${id}`);
  },

  async addContactTag(waId: string, tagId: number): Promise<unknown> {
    const { data } = await http.post(
      `/contacts/${encodeURIComponent(waId)}/tags`,
      { tagId },
    );
    return data;
  },

  async removeContactTag(waId: string, tagId: number): Promise<void> {
    await http.delete(
      `/contacts/${encodeURIComponent(waId)}/tags/${tagId}`,
    );
  },

  // ── Handoff queue ──────────────────────────────────────────

  async handoffQueue(
    options?: { onlyMine?: boolean },
  ): Promise<HandoffQueueItem[]> {
    const { data } = await http.get<HandoffQueueItem[]>(
      `/handoff/queue${qs({ onlyMine: options?.onlyMine ? 1 : undefined })}`,
    );
    return data;
  },

  async assignHandoff(
    waId: string,
    owner?: string | null,
  ): Promise<{ waId: string; assignedTo: string | null; assignedAt: string | null }> {
    const { data } = await http.put<{
      waId: string;
      assignedTo: string | null;
      assignedAt: string | null;
    }>(
      `/handoff/queue/${encodeURIComponent(waId)}/assign`,
      { owner: owner ?? null },
    );
    return data;
  },

  // ── Tasks ──────────────────────────────────────────────────

  async tasks(
    filters?: {
      waId?: string;
      status?: TaskStatus | "";
      priority?: TaskPriority | "";
      contactId?: number;
    },
  ): Promise<Task[]> {
    const { data } = await http.get<Task[]>(
      `/tasks${qs({
        waId: filters?.waId,
        status: filters?.status,
        priority: filters?.priority,
        contactId: filters?.contactId,
      })}`,
    );
    return data;
  },

  async createTask(
    input: {
      waId: string;
      title: string;
      description?: string;
      dueAt: string;
      status?: TaskStatus;
      priority?: TaskPriority;
    },
  ): Promise<Task> {
    const { data } = await http.post<Task>("/tasks", input);
    return data;
  },

  async updateTask(
    id: number,
    input: Partial<{
      title: string;
      description: string | null;
      dueAt: string;
      status: TaskStatus;
      priority: TaskPriority;
      waId: string;
      contactId: number;
    }>,
  ): Promise<Task> {
    const { data } = await http.put<Task>(`/tasks/${id}`, input);
    return data;
  },

  async deleteTask(id: number): Promise<void> {
    await http.delete(`/tasks/${id}`);
  },
};

export { http };
