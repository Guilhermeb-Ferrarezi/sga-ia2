// ── Auth ────────────────────────────────────────────────────

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

export interface CreateUserInput {
  email: string;
  password: string;
  name?: string;
  role?: "ADMIN" | "AGENT";
}

// ── Dashboard ───────────────────────────────────────────────

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

// ── Pipeline & Contacts ─────────────────────────────────────

export interface PipelineStage {
  id: number;
  name: string;
  position: number;
  color: string;
  isActive: boolean;
}

export interface Tag {
  id: number;
  name: string;
  color: string;
}

export interface ContactTag {
  id: number;
  contactId: number;
  tagId: number;
  tag: Tag;
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

// ── Tasks ───────────────────────────────────────────────────

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
  contact: { id: number; waId: string; name: string | null };
}

// ── Handoffs ────────────────────────────────────────────────

export type HandoffSlaLevel = "ok" | "warning" | "critical";

export interface HandoffQueueItem {
  waId: string;
  name: string | null;
  stage: { id: number; name: string; color: string } | null;
  handoffReason: string | null;
  handoffAt: string | null;
  waitMinutes: number;
  slaLevel: HandoffSlaLevel;
  assignedTo: string | null;
  assignedAt: string | null;
  latestMessage: { body: string; createdAt: string } | null;
  openTasks: Array<{
    id: number;
    title: string;
    dueAt: string;
    status: string;
    priority: string;
  }>;
}

// ── Operational Alerts ──────────────────────────────────────

export interface OperationalAlertsSummary {
  overdueTasks: number;
  pendingHandoffs: number;
  criticalHandoffs: number;
  updatedAt: string;
}

// ── Content ─────────────────────────────────────────────────

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

// ── Pagination ──────────────────────────────────────────────

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

// ── Audit ───────────────────────────────────────────────────

export interface AuditLogEntry {
  id: number;
  action: string;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
  user: { name: string | null; email: string } | null;
}

// ── Funnel ──────────────────────────────────────────────────

export interface FunnelStageMetric {
  stageId: number;
  stageName: string;
  total: number;
  won: number;
  lost: number;
  conversionRate: number;
  avgHoursInStage: number | null;
}

// ── WebSocket ───────────────────────────────────────────────

export type WsConnectionStatus = "connected" | "reconnecting" | "disconnected";

export interface WsEventPayload {
  type: string;
  payload: Record<string, unknown>;
  ts: number;
}

// ── Toast ───────────────────────────────────────────────────

export type ToastVariant = "info" | "success" | "error";

export interface ToastInput {
  title: string;
  description?: string;
  variant?: ToastVariant;
  durationMs?: number;
}
