import type { UserRole } from "@prisma/client";

export const PERMISSIONS = {
  DASHBOARD_VIEW: "dashboard.view",
  CONVERSATIONS_VIEW: "conversations.view",
  CONVERSATIONS_REPLY: "conversations.reply",
  CONTACTS_VIEW: "contacts.view",
  CONTACTS_CREATE: "contacts.create",
  CONTACTS_EDIT: "contacts.edit",
  CONTACTS_MANAGE_TAGS: "contacts.manage_tags",
  CONTACTS_MANAGE_BOT: "contacts.manage_bot",
  CONTACTS_MANAGE_HANDOFF: "contacts.manage_handoff",
  LEADS_MANAGE_STATUS: "leads.manage_status",
  LEADS_MANAGE_STAGE: "leads.manage_stage",
  LEADS_DELETE: "leads.delete",
  PIPELINE_VIEW: "pipeline.view",
  PIPELINE_MANAGE: "pipeline.manage",
  FAQS_VIEW: "faqs.view",
  FAQS_MANAGE: "faqs.manage",
  TEMPLATES_VIEW: "templates.view",
  TEMPLATES_MANAGE: "templates.manage",
  TAGS_VIEW: "tags.view",
  TAGS_MANAGE: "tags.manage",
  AUDIOS_VIEW: "audios.view",
  AUDIOS_MANAGE: "audios.manage",
  TASKS_VIEW: "tasks.view",
  TASKS_MANAGE: "tasks.manage",
  HANDOFF_VIEW: "handoff.view",
  HANDOFF_ASSIGN: "handoff.assign",
  WHATSAPP_PROFILE_VIEW: "whatsapp_profile.view",
  WHATSAPP_PROFILE_MANAGE: "whatsapp_profile.manage",
  USERS_MANAGE: "users.manage",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS = Object.values(PERMISSIONS) as Permission[];
const PERMISSION_SET = new Set<Permission>(ALL_PERMISSIONS);

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Administrador",
  MANAGER: "Gestor",
  AGENT: "Atendente",
  VIEWER: "Visualizador",
  CUSTOM: "Cargo personalizado",
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  ADMIN: "Acesso total ao painel, usuarios e configuracoes sensiveis.",
  MANAGER: "Gestao operacional sem controle de usuarios e sem alteracoes sensiveis da conta.",
  AGENT: "Atendimento diario com operacao de contatos, tarefas e handoffs.",
  VIEWER: "Acesso somente leitura aos modulos permitidos.",
  CUSTOM: "Permissoes definidas manualmente no criador de cargos.",
};

export const PRESET_ROLE_OPTIONS: UserRole[] = [
  "VIEWER",
  "AGENT",
  "MANAGER",
  "ADMIN",
];

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  ADMIN: ALL_PERMISSIONS,
  MANAGER: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.CONVERSATIONS_VIEW,
    PERMISSIONS.CONVERSATIONS_REPLY,
    PERMISSIONS.CONTACTS_VIEW,
    PERMISSIONS.CONTACTS_CREATE,
    PERMISSIONS.CONTACTS_EDIT,
    PERMISSIONS.CONTACTS_MANAGE_TAGS,
    PERMISSIONS.CONTACTS_MANAGE_BOT,
    PERMISSIONS.CONTACTS_MANAGE_HANDOFF,
    PERMISSIONS.LEADS_MANAGE_STATUS,
    PERMISSIONS.LEADS_MANAGE_STAGE,
    PERMISSIONS.LEADS_DELETE,
    PERMISSIONS.PIPELINE_VIEW,
    PERMISSIONS.PIPELINE_MANAGE,
    PERMISSIONS.FAQS_VIEW,
    PERMISSIONS.FAQS_MANAGE,
    PERMISSIONS.TEMPLATES_VIEW,
    PERMISSIONS.TEMPLATES_MANAGE,
    PERMISSIONS.TAGS_VIEW,
    PERMISSIONS.TAGS_MANAGE,
    PERMISSIONS.AUDIOS_VIEW,
    PERMISSIONS.AUDIOS_MANAGE,
    PERMISSIONS.TASKS_VIEW,
    PERMISSIONS.TASKS_MANAGE,
    PERMISSIONS.HANDOFF_VIEW,
    PERMISSIONS.HANDOFF_ASSIGN,
    PERMISSIONS.WHATSAPP_PROFILE_VIEW,
  ],
  AGENT: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.CONVERSATIONS_VIEW,
    PERMISSIONS.CONVERSATIONS_REPLY,
    PERMISSIONS.CONTACTS_VIEW,
    PERMISSIONS.CONTACTS_EDIT,
    PERMISSIONS.CONTACTS_MANAGE_TAGS,
    PERMISSIONS.CONTACTS_MANAGE_BOT,
    PERMISSIONS.CONTACTS_MANAGE_HANDOFF,
    PERMISSIONS.PIPELINE_VIEW,
    PERMISSIONS.FAQS_VIEW,
    PERMISSIONS.TEMPLATES_VIEW,
    PERMISSIONS.TAGS_VIEW,
    PERMISSIONS.AUDIOS_VIEW,
    PERMISSIONS.TASKS_VIEW,
    PERMISSIONS.TASKS_MANAGE,
    PERMISSIONS.HANDOFF_VIEW,
    PERMISSIONS.HANDOFF_ASSIGN,
    PERMISSIONS.WHATSAPP_PROFILE_VIEW,
  ],
  VIEWER: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.CONVERSATIONS_VIEW,
    PERMISSIONS.CONTACTS_VIEW,
    PERMISSIONS.PIPELINE_VIEW,
    PERMISSIONS.FAQS_VIEW,
    PERMISSIONS.TEMPLATES_VIEW,
    PERMISSIONS.TAGS_VIEW,
    PERMISSIONS.AUDIOS_VIEW,
    PERMISSIONS.TASKS_VIEW,
    PERMISSIONS.HANDOFF_VIEW,
    PERMISSIONS.WHATSAPP_PROFILE_VIEW,
  ],
  CUSTOM: [],
};

export const getRolePermissions = (role: UserRole): Permission[] =>
  ROLE_PERMISSIONS[role] ?? [];

export const normalizePermissionList = (value: unknown): Permission[] => {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value.filter(
        (item): item is Permission =>
          typeof item === "string" && PERMISSION_SET.has(item as Permission),
      ),
    ),
  );
};

export const hasPermission = (
  roleOrPermissions: UserRole | Permission[],
  permission: Permission,
): boolean => {
  const permissions = Array.isArray(roleOrPermissions)
    ? roleOrPermissions
    : getRolePermissions(roleOrPermissions);
  return permissions.includes(permission);
};
