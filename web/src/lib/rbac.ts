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
export type UserRole = "ADMIN" | "MANAGER" | "AGENT" | "VIEWER" | "CUSTOM";
export type PresetUserRole = Exclude<UserRole, "CUSTOM">;

const ALL_PERMISSIONS = Object.values(PERMISSIONS) as Permission[];

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

export const ROLE_OPTIONS: Array<{ value: PresetUserRole; label: string; description: string }> = [
  { value: "VIEWER", label: ROLE_LABELS.VIEWER, description: ROLE_DESCRIPTIONS.VIEWER },
  { value: "AGENT", label: ROLE_LABELS.AGENT, description: ROLE_DESCRIPTIONS.AGENT },
  { value: "MANAGER", label: ROLE_LABELS.MANAGER, description: ROLE_DESCRIPTIONS.MANAGER },
  { value: "ADMIN", label: ROLE_LABELS.ADMIN, description: ROLE_DESCRIPTIONS.ADMIN },
];

export const PERMISSION_LABELS: Record<Permission, string> = {
  [PERMISSIONS.DASHBOARD_VIEW]: "Ver visao geral",
  [PERMISSIONS.CONVERSATIONS_VIEW]: "Ver conversas",
  [PERMISSIONS.CONVERSATIONS_REPLY]: "Responder conversas",
  [PERMISSIONS.CONTACTS_VIEW]: "Ver contatos",
  [PERMISSIONS.CONTACTS_CREATE]: "Criar contatos",
  [PERMISSIONS.CONTACTS_EDIT]: "Editar contatos",
  [PERMISSIONS.CONTACTS_MANAGE_TAGS]: "Gerenciar tags de contatos",
  [PERMISSIONS.CONTACTS_MANAGE_BOT]: "Ativar ou desativar bot",
  [PERMISSIONS.CONTACTS_MANAGE_HANDOFF]: "Gerenciar handoff do contato",
  [PERMISSIONS.LEADS_MANAGE_STATUS]: "Alterar status do lead",
  [PERMISSIONS.LEADS_MANAGE_STAGE]: "Mover lead no pipeline",
  [PERMISSIONS.LEADS_DELETE]: "Excluir leads",
  [PERMISSIONS.PIPELINE_VIEW]: "Ver pipeline",
  [PERMISSIONS.PIPELINE_MANAGE]: "Gerenciar pipeline",
  [PERMISSIONS.FAQS_VIEW]: "Ver FAQs",
  [PERMISSIONS.FAQS_MANAGE]: "Gerenciar FAQs",
  [PERMISSIONS.TEMPLATES_VIEW]: "Ver templates",
  [PERMISSIONS.TEMPLATES_MANAGE]: "Gerenciar templates",
  [PERMISSIONS.TAGS_VIEW]: "Ver tags",
  [PERMISSIONS.TAGS_MANAGE]: "Gerenciar tags",
  [PERMISSIONS.AUDIOS_VIEW]: "Ver audios",
  [PERMISSIONS.AUDIOS_MANAGE]: "Gerenciar audios",
  [PERMISSIONS.TASKS_VIEW]: "Ver tarefas",
  [PERMISSIONS.TASKS_MANAGE]: "Gerenciar tarefas",
  [PERMISSIONS.HANDOFF_VIEW]: "Ver fila de handoff",
  [PERMISSIONS.HANDOFF_ASSIGN]: "Assumir ou liberar handoff",
  [PERMISSIONS.WHATSAPP_PROFILE_VIEW]: "Ver perfil do WhatsApp",
  [PERMISSIONS.WHATSAPP_PROFILE_MANAGE]: "Editar perfil do WhatsApp",
  [PERMISSIONS.USERS_MANAGE]: "Gerenciar usuarios",
};

export const PERMISSION_GROUPS: Array<{ title: string; permissions: Permission[] }> = [
  {
    title: "Dashboard e atendimento",
    permissions: [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.CONVERSATIONS_VIEW,
      PERMISSIONS.CONVERSATIONS_REPLY,
      PERMISSIONS.HANDOFF_VIEW,
      PERMISSIONS.HANDOFF_ASSIGN,
      PERMISSIONS.TASKS_VIEW,
      PERMISSIONS.TASKS_MANAGE,
    ],
  },
  {
    title: "Contatos e pipeline",
    permissions: [
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
    ],
  },
  {
    title: "Base de conteudo",
    permissions: [
      PERMISSIONS.FAQS_VIEW,
      PERMISSIONS.FAQS_MANAGE,
      PERMISSIONS.TEMPLATES_VIEW,
      PERMISSIONS.TEMPLATES_MANAGE,
      PERMISSIONS.TAGS_VIEW,
      PERMISSIONS.TAGS_MANAGE,
      PERMISSIONS.AUDIOS_VIEW,
      PERMISSIONS.AUDIOS_MANAGE,
    ],
  },
  {
    title: "Configuracoes sensiveis",
    permissions: [
      PERMISSIONS.WHATSAPP_PROFILE_VIEW,
      PERMISSIONS.WHATSAPP_PROFILE_MANAGE,
      PERMISSIONS.USERS_MANAGE,
    ],
  },
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

type UserWithPermissions = { permissions?: Permission[] | null } | null | undefined;

export const hasPermission = (
  user: UserWithPermissions,
  permission: Permission,
): boolean => Boolean(user?.permissions?.includes(permission));

export const hasAnyPermission = (
  user: UserWithPermissions,
  permissions: Permission[],
): boolean => permissions.some((permission) => hasPermission(user, permission));
