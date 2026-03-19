import { config } from "../config";

type Schema = Record<string, unknown>;
type Doc = Record<string, unknown>;

const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });
const responseRef = (name: string): Schema => ({
  $ref: `#/components/responses/${name}`,
});

const genericObject = {
  type: "object",
  additionalProperties: true,
} satisfies Schema;

const genericArray = {
  type: "array",
  items: genericObject,
} satisfies Schema;

const jsonContent = (schema: Schema): Schema => ({
  "application/json": { schema },
});

const jsonBody = (schema: Schema, required = true): Schema => ({
  required,
  content: jsonContent(schema),
});

const multipartBody = (schema: Schema): Schema => ({
  required: true,
  content: {
    "multipart/form-data": {
      schema,
    },
  },
});

const response = (description: string, schema?: Schema): Schema =>
  schema ? { description, content: jsonContent(schema) } : { description };

const textResponse = (description: string, mediaType = "text/plain"): Schema => ({
  description,
  content: {
    [mediaType]: {
      schema: { type: "string" },
    },
  },
});

const pathParam = (
  name: string,
  description: string,
  schema: Schema = { type: "string" },
): Schema => ({
  name,
  in: "path",
  required: true,
  description,
  schema,
});

const queryParam = (
  name: string,
  description: string,
  schema: Schema = { type: "string" },
): Schema => ({
  name,
  in: "query",
  required: false,
  description,
  schema,
});

const securedResponses = (responses: Record<string, unknown>) => ({
  ...responses,
  "401": responseRef("Unauthorized"),
  "403": responseRef("Forbidden"),
});

const buildServers = (req?: Request): Schema[] => {
  const servers: Schema[] = [
    {
      url: config.apiBasePath,
      description: "Base path configurado da API",
    },
  ];

  if (!req) return servers;

  try {
    const url = new URL(req.url);
    servers.unshift({
      url: `${url.origin}${config.apiBasePath}`,
      description: "Origem atual",
    });
  } catch {
    // Keep only the relative server URL.
  }

  return servers;
};

const paginationParams = [
  queryParam("limit", "Quantidade de itens por pagina", {
    type: "integer",
    minimum: 1,
  }),
  queryParam("offset", "Deslocamento inicial", {
    type: "integer",
    minimum: 0,
  }),
];

const pipelineFilterParams = [
  queryParam("searchTerm", "Busca no pipeline"),
  queryParam("statusFilter", "Status do lead", {
    type: "string",
    enum: ["all", "open", "won", "lost"],
  }),
  queryParam("handoffFilter", "Filtro de handoff", {
    type: "string",
    enum: ["all", "yes", "no"],
  }),
  queryParam("botFilter", "Filtro do bot", {
    type: "string",
    enum: ["all", "on", "off"],
  }),
  queryParam("triageFilter", "Filtro de triagem", {
    type: "string",
    enum: ["all", "done", "pending"],
  }),
];

export const buildOpenApiDocument = (req?: Request): Doc => ({
  openapi: "3.0.3",
  info: {
    title: `${config.appName} API`,
    version: "1.0.0",
    description: "Documentacao Swagger/OpenAPI do backend.",
  },
  servers: buildServers(req),
  security: [{ bearerAuth: [] }],
  tags: [
    { name: "Sistema" },
    { name: "Autenticacao" },
    { name: "Configuracoes" },
    { name: "Dashboard" },
    { name: "Pipeline" },
    { name: "Contatos" },
    { name: "FAQs" },
    { name: "Templates" },
    { name: "Tags" },
    { name: "Tasks" },
    { name: "Usuarios" },
    { name: "Cargos" },
    { name: "Handoff" },
    { name: "Audios" },
    { name: "Relatorios" },
    { name: "Webhook" },
  ],
  paths: {
    "/health": {
      get: {
        tags: ["Sistema"],
        summary: "Health check",
        security: [],
        responses: {
          "200": response("Servidor ativo", ref("HealthResponse")),
        },
      },
    },
    "/auth/login": {
      post: {
        tags: ["Autenticacao"],
        summary: "Login",
        security: [],
        requestBody: jsonBody(ref("LoginRequest")),
        responses: {
          "200": response("Sessao criada", ref("LoginResponse")),
          "400": responseRef("BadRequest"),
          "401": response("Credenciais invalidas", ref("ErrorResponse")),
        },
      },
    },
    "/auth/me": {
      get: {
        tags: ["Autenticacao"],
        summary: "Usuario autenticado",
        responses: securedResponses({
          "200": response("Usuario atual", genericObject),
        }),
      },
    },
    "/settings/ai": {
      get: {
        tags: ["Configuracoes"],
        summary: "Ler configuracoes da IA",
        responses: securedResponses({
          "200": response("Configuracoes", ref("AiSettings")),
        }),
      },
      put: {
        tags: ["Configuracoes"],
        summary: "Salvar configuracoes da IA",
        requestBody: jsonBody(ref("AiSettingsInput")),
        responses: securedResponses({
          "200": response("Configuracoes salvas", ref("AiSettings")),
          "400": responseRef("BadRequest"),
        }),
      },
    },
    "/whatsapp/profile": {
      get: {
        tags: ["Configuracoes"],
        summary: "Ler perfil do WhatsApp",
        responses: securedResponses({
          "200": response("Perfil", genericObject),
        }),
      },
      put: {
        tags: ["Configuracoes"],
        summary: "Atualizar perfil do WhatsApp",
        requestBody: multipartBody(ref("WhatsAppProfileUpdateRequest")),
        responses: securedResponses({
          "200": response("Perfil atualizado", genericObject),
          "400": responseRef("BadRequest"),
        }),
      },
    },
    "/dashboard/overview": {
      get: {
        tags: ["Dashboard"],
        summary: "Resumo do dashboard",
        responses: securedResponses({
          "200": response("Resumo", genericObject),
        }),
      },
    },
    "/dashboard/alerts": {
      get: {
        tags: ["Dashboard"],
        summary: "Alertas operacionais",
        responses: securedResponses({
          "200": response("Alertas", genericObject),
        }),
      },
    },
    "/dashboard/conversations": {
      get: {
        tags: ["Dashboard"],
        summary: "Conversas recentes",
        parameters: [queryParam("limit", "Quantidade maxima", { type: "integer", minimum: 1 })],
        responses: securedResponses({
          "200": response("Lista de conversas", genericArray),
        }),
      },
    },
    "/dashboard/conversations/{phone}/turns": {
      get: {
        tags: ["Dashboard"],
        summary: "Mensagens de uma conversa",
        parameters: [pathParam("phone", "waId/telefone do contato"), ...paginationParams],
        responses: securedResponses({
          "200": response("Pagina de mensagens", ref("PaginatedResult")),
          "400": responseRef("BadRequest"),
        }),
      },
    },
    "/dashboard/cache/metrics": {
      get: {
        tags: ["Dashboard"],
        summary: "Metricas de cache",
        responses: securedResponses({
          "200": response("Metricas", genericObject),
        }),
      },
    },
    "/pipeline/funnel": {
      get: {
        tags: ["Pipeline"],
        summary: "Metricas do funil",
        responses: securedResponses({
          "200": response("Funil", genericArray),
        }),
      },
    },
    "/pipeline/stages": {
      get: {
        tags: ["Pipeline"],
        summary: "Listar etapas do pipeline",
        parameters: [
          queryParam("search", "Busca por nome"),
          queryParam("includeInactive", "Incluir etapas inativas", { type: "boolean" }),
        ],
        responses: securedResponses({
          "200": response("Etapas", genericArray),
        }),
      },
      post: {
        tags: ["Pipeline"],
        summary: "Criar etapa do pipeline",
        requestBody: jsonBody(ref("PipelineStageInput")),
        responses: securedResponses({
          "201": response("Etapa criada", genericObject),
          "400": responseRef("BadRequest"),
        }),
      },
    },
    "/pipeline/stages/reorder": {
      post: {
        tags: ["Pipeline"],
        summary: "Reordenar etapas",
        requestBody: jsonBody(ref("PipelineReorderRequest")),
        responses: securedResponses({
          "200": response("Ordem atualizada", ref("OkResponse")),
          "400": responseRef("BadRequest"),
        }),
      },
    },
    "/pipeline/stages/{id}": {
      put: {
        tags: ["Pipeline"],
        summary: "Atualizar etapa",
        parameters: [pathParam("id", "ID da etapa", { type: "integer" })],
        requestBody: jsonBody(ref("PipelineStageInput")),
        responses: securedResponses({
          "200": response("Etapa atualizada", genericObject),
          "400": responseRef("BadRequest"),
        }),
      },
      delete: {
        tags: ["Pipeline"],
        summary: "Excluir etapa",
        parameters: [pathParam("id", "ID da etapa", { type: "integer" })],
        responses: securedResponses({
          "200": response("Etapa removida", ref("OkResponse")),
        }),
      },
    },
    "/pipeline/board": {
      get: {
        tags: ["Pipeline"],
        summary: "Carregar board do pipeline",
        parameters: [
          queryParam("limit", "Quantidade por coluna", { type: "integer", minimum: 5 }),
          ...pipelineFilterParams,
        ],
        responses: securedResponses({
          "200": response("Board", genericObject),
        }),
      },
    },
    "/pipeline/board/column": {
      get: {
        tags: ["Pipeline"],
        summary: "Carregar uma coluna do pipeline",
        parameters: [
          queryParam("stageId", "ID da etapa ou null/unassigned"),
          ...paginationParams,
          ...pipelineFilterParams,
        ],
        responses: securedResponses({
          "200": response("Pagina da coluna", ref("PaginatedResult")),
          "400": responseRef("BadRequest"),
          "404": responseRef("NotFound"),
        }),
      },
    },
    "/contacts": {
      post: {
        tags: ["Contatos"],
        summary: "Criar contato",
        requestBody: jsonBody(ref("ContactCreateRequest")),
        responses: securedResponses({
          "201": response("Contato criado", genericObject),
          "400": responseRef("BadRequest"),
          "404": responseRef("NotFound"),
          "409": responseRef("Conflict"),
        }),
      },
    },
    "/contacts/batch": {
      post: {
        tags: ["Contatos"],
        summary: "Acao em lote sobre contatos",
        requestBody: jsonBody(ref("ContactsBatchRequest")),
        responses: securedResponses({
          "200": response("Acao executada", genericObject),
          "400": responseRef("BadRequest"),
        }),
      },
    },
    "/contacts/{waId}": {
      put: {
        tags: ["Contatos"],
        summary: "Atualizar contato",
        parameters: [pathParam("waId", "WhatsApp ID do contato")],
        requestBody: jsonBody(ref("ContactUpdateRequest")),
        responses: securedResponses({
          "200": response("Contato atualizado", genericObject),
          "400": responseRef("BadRequest"),
          "404": responseRef("NotFound"),
        }),
      },
      delete: {
        tags: ["Contatos"],
        summary: "Excluir contato",
        parameters: [pathParam("waId", "WhatsApp ID do contato")],
        responses: securedResponses({
          "200": response("Contato removido", ref("OkResponse")),
          "404": responseRef("NotFound"),
        }),
      },
    },
    "/contacts/{waId}/stage": {
      put: {
        tags: ["Contatos"],
        summary: "Atualizar etapa do contato",
        parameters: [pathParam("waId", "WhatsApp ID do contato")],
        requestBody: jsonBody(ref("ContactStageUpdateRequest")),
        responses: securedResponses({
          "200": response("Etapa atualizada", genericObject),
          "400": responseRef("BadRequest"),
          "404": responseRef("NotFound"),
        }),
      },
    },
    "/contacts/{waId}/status": {
      put: {
        tags: ["Contatos"],
        summary: "Atualizar status do lead",
        parameters: [pathParam("waId", "WhatsApp ID do contato")],
        requestBody: jsonBody(ref("ContactStatusUpdateRequest")),
        responses: securedResponses({
          "200": response("Status atualizado", genericObject),
          "400": responseRef("BadRequest"),
          "404": responseRef("NotFound"),
        }),
      },
    },
    "/contacts/{waId}/bot": {
      put: {
        tags: ["Contatos"],
        summary: "Ativar ou desativar o bot",
        parameters: [pathParam("waId", "WhatsApp ID do contato")],
        requestBody: jsonBody(ref("ContactBotToggleRequest")),
        responses: securedResponses({
          "200": response("Bot atualizado", genericObject),
          "400": responseRef("BadRequest"),
          "404": responseRef("NotFound"),
        }),
      },
    },
    "/contacts/{waId}/send": {
      post: {
        tags: ["Contatos"],
        summary: "Enviar mensagem manual",
        parameters: [pathParam("waId", "WhatsApp ID do contato")],
        requestBody: jsonBody(ref("ContactSendRequest")),
        responses: securedResponses({
          "200": response("Mensagem enviada", ref("OkResponse")),
          "400": responseRef("BadRequest"),
          "404": responseRef("NotFound"),
        }),
      },
    },
    "/contacts/{waId}/tags": {
      post: {
        tags: ["Contatos"],
        summary: "Adicionar tag ao contato",
        parameters: [pathParam("waId", "WhatsApp ID do contato")],
        requestBody: jsonBody(ref("ContactTagRequest")),
        responses: securedResponses({
          "200": response("Tag adicionada", genericObject),
          "400": responseRef("BadRequest"),
          "404": responseRef("NotFound"),
        }),
      },
    },
    "/contacts/{waId}/tags/{tagId}": {
      delete: {
        tags: ["Contatos"],
        summary: "Remover tag do contato",
        parameters: [
          pathParam("waId", "WhatsApp ID do contato"),
          pathParam("tagId", "ID da tag", { type: "integer" }),
        ],
        responses: securedResponses({
          "200": response("Tag removida", ref("OkResponse")),
          "404": responseRef("NotFound"),
        }),
      },
    },
    "/contacts/{waId}/audit": {
      get: {
        tags: ["Contatos"],
        summary: "Historico de auditoria",
        parameters: [pathParam("waId", "WhatsApp ID do contato")],
        responses: securedResponses({
          "200": response("Auditoria", genericArray),
          "404": responseRef("NotFound"),
        }),
      },
    },
    "/faqs": {
      get: {
        tags: ["FAQs"],
        summary: "Listar FAQs",
        parameters: [
          ...paginationParams,
          queryParam("search", "Busca textual"),
          queryParam("isActive", "Filtro por ativo/inativo", { type: "boolean" }),
          queryParam("subject", "Filtro por assunto"),
          queryParam("faqType", "Filtro por tipo"),
          queryParam("edition", "Filtro por edicao"),
        ],
        responses: securedResponses({
          "200": response("Pagina de FAQs", ref("PaginatedResult")),
        }),
      },
      post: {
        tags: ["FAQs"],
        summary: "Criar FAQ",
        requestBody: jsonBody(ref("FaqRequest")),
        responses: securedResponses({
          "201": response("FAQ criada", genericObject),
          "400": responseRef("BadRequest"),
        }),
      },
    },
    "/faqs/{id}": {
      put: {
        tags: ["FAQs"],
        summary: "Atualizar FAQ",
        parameters: [pathParam("id", "ID da FAQ", { type: "integer" })],
        requestBody: jsonBody(ref("FaqRequest")),
        responses: securedResponses({
          "200": response("FAQ atualizada", genericObject),
          "400": responseRef("BadRequest"),
          "404": responseRef("NotFound"),
        }),
      },
      delete: {
        tags: ["FAQs"],
        summary: "Excluir FAQ",
        parameters: [pathParam("id", "ID da FAQ", { type: "integer" })],
        responses: securedResponses({
          "200": response("FAQ removida", ref("OkResponse")),
          "404": responseRef("NotFound"),
        }),
      },
    },
    "/templates": {
      get: {
        tags: ["Templates"],
        summary: "Listar templates",
        parameters: [...paginationParams, queryParam("search", "Busca"), queryParam("category", "Categoria")],
        responses: securedResponses({
          "200": response("Pagina de templates", ref("PaginatedResult")),
        }),
      },
      post: {
        tags: ["Templates"],
        summary: "Criar template",
        requestBody: jsonBody(ref("TemplateRequest")),
        responses: securedResponses({
          "201": response("Template criado", genericObject),
          "400": responseRef("BadRequest"),
        }),
      },
    },
    "/templates/{id}": {
      put: {
        tags: ["Templates"],
        summary: "Atualizar template",
        parameters: [pathParam("id", "ID do template", { type: "integer" })],
        requestBody: jsonBody(ref("TemplateRequest")),
        responses: securedResponses({
          "200": response("Template atualizado", genericObject),
          "400": responseRef("BadRequest"),
        }),
      },
      delete: {
        tags: ["Templates"],
        summary: "Excluir template",
        parameters: [pathParam("id", "ID do template", { type: "integer" })],
        responses: securedResponses({
          "200": response("Template removido", ref("OkResponse")),
        }),
      },
    },
    "/tags": {
      get: {
        tags: ["Tags"],
        summary: "Listar tags",
        parameters: [...paginationParams, queryParam("search", "Busca por nome")],
        responses: securedResponses({
          "200": response("Pagina de tags", ref("PaginatedResult")),
        }),
      },
      post: {
        tags: ["Tags"],
        summary: "Criar tag",
        requestBody: jsonBody(ref("TagRequest")),
        responses: securedResponses({
          "201": response("Tag criada", genericObject),
          "400": responseRef("BadRequest"),
        }),
      },
    },
    "/tags/{id}": {
      put: {
        tags: ["Tags"],
        summary: "Atualizar tag",
        parameters: [pathParam("id", "ID da tag", { type: "integer" })],
        requestBody: jsonBody(ref("TagRequest")),
        responses: securedResponses({
          "200": response("Tag atualizada", genericObject),
          "400": responseRef("BadRequest"),
        }),
      },
      delete: {
        tags: ["Tags"],
        summary: "Excluir tag",
        parameters: [pathParam("id", "ID da tag", { type: "integer" })],
        responses: securedResponses({
          "200": response("Tag removida", ref("OkResponse")),
        }),
      },
    },
    "/tasks": {
      get: {
        tags: ["Tasks"],
        summary: "Listar tarefas",
        parameters: [
          queryParam("waId", "Filtro por waId"),
          queryParam("contactId", "Filtro por ID do contato", { type: "integer" }),
          queryParam("status", "Filtro por status"),
          queryParam("priority", "Filtro por prioridade"),
        ],
        responses: securedResponses({
          "200": response("Lista de tarefas", genericArray),
        }),
      },
      post: {
        tags: ["Tasks"],
        summary: "Criar tarefa",
        requestBody: jsonBody(ref("TaskRequest")),
        responses: securedResponses({
          "201": response("Tarefa criada", genericObject),
          "400": responseRef("BadRequest"),
          "404": responseRef("NotFound"),
        }),
      },
    },
    "/tasks/{id}": {
      put: {
        tags: ["Tasks"],
        summary: "Atualizar tarefa",
        parameters: [pathParam("id", "ID da tarefa", { type: "integer" })],
        requestBody: jsonBody(ref("TaskRequest")),
        responses: securedResponses({
          "200": response("Tarefa atualizada", genericObject),
          "400": responseRef("BadRequest"),
        }),
      },
      delete: {
        tags: ["Tasks"],
        summary: "Excluir tarefa",
        parameters: [pathParam("id", "ID da tarefa", { type: "integer" })],
        responses: securedResponses({
          "200": response("Tarefa removida", ref("OkResponse")),
        }),
      },
    },
    "/roles": {
      get: {
        tags: ["Cargos"],
        summary: "Listar cargos personalizados",
        responses: securedResponses({
          "200": response("Lista de cargos", genericObject),
        }),
      },
      post: {
        tags: ["Cargos"],
        summary: "Criar cargo personalizado",
        requestBody: jsonBody(ref("RoleRequest")),
        responses: securedResponses({
          "201": response("Cargo criado", genericObject),
          "400": responseRef("BadRequest"),
          "409": responseRef("Conflict"),
        }),
      },
    },
    "/roles/{id}": {
      put: {
        tags: ["Cargos"],
        summary: "Atualizar cargo personalizado",
        parameters: [pathParam("id", "ID do cargo")],
        requestBody: jsonBody(ref("RoleRequest")),
        responses: securedResponses({
          "200": response("Cargo atualizado", genericObject),
          "400": responseRef("BadRequest"),
          "404": responseRef("NotFound"),
          "409": responseRef("Conflict"),
        }),
      },
      delete: {
        tags: ["Cargos"],
        summary: "Excluir cargo personalizado",
        parameters: [pathParam("id", "ID do cargo")],
        responses: securedResponses({
          "200": response("Cargo removido", ref("OkResponse")),
          "404": responseRef("NotFound"),
          "409": responseRef("Conflict"),
        }),
      },
    },
    "/users": {
      get: {
        tags: ["Usuarios"],
        summary: "Listar usuarios",
        responses: securedResponses({
          "200": response("Lista de usuarios", genericObject),
        }),
      },
      post: {
        tags: ["Usuarios"],
        summary: "Criar usuario",
        requestBody: jsonBody(ref("UserRequest")),
        responses: securedResponses({
          "201": response("Usuario criado", genericObject),
          "400": responseRef("BadRequest"),
          "409": responseRef("Conflict"),
        }),
      },
    },
    "/users/{id}": {
      delete: {
        tags: ["Usuarios"],
        summary: "Excluir usuario",
        parameters: [pathParam("id", "ID do usuario")],
        responses: securedResponses({
          "200": response("Usuario removido", ref("OkResponse")),
          "400": responseRef("BadRequest"),
          "404": responseRef("NotFound"),
        }),
      },
    },
    "/handoff/queue": {
      get: {
        tags: ["Handoff"],
        summary: "Listar fila de handoff",
        parameters: [
          queryParam("onlyMine", "Apenas itens atribuidos ao usuario logado", {
            type: "boolean",
          }),
        ],
        responses: securedResponses({
          "200": response("Fila", genericArray),
        }),
      },
    },
    "/handoff/queue/{waId}/assign": {
      put: {
        tags: ["Handoff"],
        summary: "Atribuir ou liberar handoff",
        parameters: [pathParam("waId", "WhatsApp ID do contato")],
        requestBody: jsonBody(ref("HandoffAssignRequest"), false),
        responses: securedResponses({
          "200": response("Handoff atualizado", genericObject),
          "400": responseRef("BadRequest"),
          "404": responseRef("NotFound"),
        }),
      },
    },
    "/audios": {
      get: {
        tags: ["Audios"],
        summary: "Listar audios",
        parameters: [...paginationParams, queryParam("search", "Busca"), queryParam("category", "Categoria")],
        responses: securedResponses({
          "200": response("Pagina de audios", ref("PaginatedResult")),
        }),
      },
      post: {
        tags: ["Audios"],
        summary: "Enviar audio",
        requestBody: multipartBody(ref("AudioUploadRequest")),
        responses: securedResponses({
          "201": response("Audio enviado", genericObject),
          "400": responseRef("BadRequest"),
        }),
      },
    },
    "/audios/stream-url": {
      get: {
        tags: ["Audios"],
        summary: "Fazer stream a partir de URL",
        parameters: [
          queryParam("url", "URL publica do audio", { type: "string", format: "uri" }),
        ],
        responses: securedResponses({
          "200": textResponse("Stream de audio", "audio/mpeg"),
          "400": responseRef("BadRequest"),
        }),
      },
    },
    "/audios/{id}": {
      put: {
        tags: ["Audios"],
        summary: "Atualizar audio",
        parameters: [pathParam("id", "ID do audio", { type: "integer" })],
        requestBody: jsonBody(ref("AudioUpdateRequest")),
        responses: securedResponses({
          "200": response("Audio atualizado", genericObject),
          "400": responseRef("BadRequest"),
        }),
      },
      delete: {
        tags: ["Audios"],
        summary: "Excluir audio",
        parameters: [pathParam("id", "ID do audio", { type: "integer" })],
        responses: securedResponses({
          "200": response("Audio removido", ref("OkResponse")),
        }),
      },
    },
    "/audios/{id}/stream": {
      get: {
        tags: ["Audios"],
        summary: "Fazer stream do audio salvo",
        parameters: [pathParam("id", "ID do audio", { type: "integer" })],
        responses: securedResponses({
          "200": textResponse("Stream de audio", "audio/mpeg"),
          "404": responseRef("NotFound"),
        }),
      },
    },
    "/reports/leads": {
      get: {
        tags: ["Relatorios"],
        summary: "Relatorio de leads",
        parameters: [
          queryParam("days", "Quantidade de dias", {
            type: "integer",
            minimum: 1,
            maximum: 365,
          }),
        ],
        responses: securedResponses({
          "200": response("Metricas de leads", genericObject),
        }),
      },
    },
    "/reports/performance": {
      get: {
        tags: ["Relatorios"],
        summary: "Relatorio de performance",
        parameters: [
          queryParam("days", "Quantidade de dias", {
            type: "integer",
            minimum: 1,
            maximum: 365,
          }),
        ],
        responses: securedResponses({
          "200": response("Metricas da equipe", genericObject),
        }),
      },
    },
    "/reports/export": {
      get: {
        tags: ["Relatorios"],
        summary: "Exportar contatos em CSV",
        responses: securedResponses({
          "200": textResponse("CSV", "text/csv"),
        }),
      },
    },
    "/webhook": {
      get: {
        tags: ["Webhook"],
        summary: "Verificacao do webhook",
        security: [],
        parameters: [
          queryParam("hub.mode", "Modo da verificacao"),
          queryParam("hub.verify_token", "Token de verificacao"),
          queryParam("hub.challenge", "Desafio retornado pela Meta"),
        ],
        responses: {
          "200": textResponse("Webhook validado"),
          "403": textResponse("Token invalido"),
        },
      },
      post: {
        tags: ["Webhook"],
        summary: "Receber evento do WhatsApp",
        security: [],
        requestBody: jsonBody(genericObject),
        responses: {
          "200": textResponse("EVENT_RECEIVED"),
          "400": responseRef("BadRequest"),
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
    responses: {
      BadRequest: response("Requisicao invalida", ref("ErrorResponse")),
      Unauthorized: response("Nao autenticado", ref("ErrorResponse")),
      Forbidden: response("Sem permissao", ref("ErrorResponse")),
      NotFound: response("Recurso nao encontrado", ref("ErrorResponse")),
      Conflict: response("Conflito de dados", ref("ErrorResponse")),
    },
    schemas: {
      ErrorResponse: {
        type: "object",
        properties: {
          error: { type: "string" },
        },
        required: ["error"],
      },
      OkResponse: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
        },
        required: ["ok"],
      },
      HealthResponse: genericObject,
      PaginatedResult: {
        type: "object",
        properties: {
          items: genericArray,
          total: { type: "integer" },
          limit: { type: "integer" },
          offset: { type: "integer" },
          hasMore: { type: "boolean" },
        },
      },
      LoginRequest: {
        type: "object",
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string", format: "password" },
        },
        required: ["email", "password"],
      },
      LoginResponse: {
        type: "object",
        properties: {
          token: { type: "string" },
          user: genericObject,
        },
      },
      AiSettingsInput: {
        type: "object",
        properties: {
          model: { type: "string" },
          language: { type: "string" },
          personality: { type: "string" },
          style: { type: "string" },
          systemPrompt: { type: "string", nullable: true },
        },
        required: ["model", "language", "personality", "style"],
      },
      AiSettings: {
        allOf: [
          ref("AiSettingsInput"),
          {
            type: "object",
            properties: {
              createdAt: { type: "string", format: "date-time", nullable: true },
              updatedAt: { type: "string", format: "date-time", nullable: true },
              source: { type: "string", enum: ["environment", "database"] },
            },
          },
        ],
      },
      WhatsAppProfileUpdateRequest: {
        type: "object",
        properties: {
          about: { type: "string" },
          address: { type: "string" },
          description: { type: "string" },
          email: { type: "string", format: "email" },
          vertical: { type: "string" },
          websites: { type: "string" },
          profilePhoto: { type: "string", format: "binary" },
        },
      },
      PipelineStageInput: {
        type: "object",
        properties: {
          name: { type: "string" },
          color: { type: "string" },
          isActive: { type: "boolean" },
        },
      },
      PipelineReorderRequest: {
        type: "object",
        properties: {
          stageIds: {
            type: "array",
            items: { type: "integer" },
          },
        },
        required: ["stageIds"],
      },
      ContactCreateRequest: {
        type: "object",
        properties: {
          waId: { type: "string" },
          name: { type: "string", nullable: true },
          email: { type: "string", nullable: true },
          tournament: { type: "string", nullable: true },
          eventDate: { type: "string", nullable: true },
          category: { type: "string", nullable: true },
          city: { type: "string", nullable: true },
          teamName: { type: "string", nullable: true },
          playersCount: { type: "integer", nullable: true },
          source: { type: "string", nullable: true },
          notes: { type: "string", nullable: true },
          age: { type: "string", nullable: true },
          level: { type: "string", nullable: true },
          objective: { type: "string", nullable: true },
          stageId: { type: "integer", nullable: true },
          leadStatus: { type: "string", enum: ["open", "won", "lost"] },
          triageCompleted: { type: "boolean" },
          handoffRequested: { type: "boolean" },
          handoffReason: { type: "string", nullable: true },
          handoffAt: { type: "string", format: "date-time", nullable: true },
          botEnabled: { type: "boolean" },
        },
        required: ["waId"],
      },
      ContactUpdateRequest: genericObject,
      ContactStageUpdateRequest: {
        type: "object",
        properties: {
          stageId: { type: "integer", nullable: true },
        },
        required: ["stageId"],
      },
      ContactStatusUpdateRequest: {
        type: "object",
        properties: {
          leadStatus: { type: "string", enum: ["open", "won", "lost"] },
        },
        required: ["leadStatus"],
      },
      ContactBotToggleRequest: {
        type: "object",
        properties: {
          botEnabled: { type: "boolean" },
        },
        required: ["botEnabled"],
      },
      ContactSendRequest: {
        type: "object",
        properties: {
          message: { type: "string" },
        },
        required: ["message"],
      },
      ContactTagRequest: {
        type: "object",
        properties: {
          tagId: { type: "integer" },
        },
        required: ["tagId"],
      },
      ContactsBatchRequest: genericObject,
      FaqRequest: genericObject,
      TemplateRequest: genericObject,
      TagRequest: genericObject,
      TaskRequest: genericObject,
      RoleRequest: genericObject,
      UserRequest: genericObject,
      HandoffAssignRequest: {
        type: "object",
        properties: {
          owner: { type: "string", nullable: true },
        },
      },
      AudioUploadRequest: {
        type: "object",
        properties: {
          file: { type: "string", format: "binary" },
          title: { type: "string" },
          category: { type: "string" },
        },
        required: ["file"],
      },
      AudioUpdateRequest: {
        type: "object",
        properties: {
          title: { type: "string" },
          category: { type: "string" },
        },
      },
    },
  },
});

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const renderSwaggerUiHtml = (
  specUrl = "./openapi.json",
  title = `${config.appName} Swagger`,
): string => `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css" />
    <style>
      body {
        margin: 0;
        background:
          radial-gradient(circle at top left, rgba(8, 145, 178, 0.15), transparent 28%),
          linear-gradient(180deg, #0f172a 0%, #020617 100%);
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      }
      .shell {
        min-height: 100vh;
        padding: 20px;
      }
      .header {
        max-width: 1200px;
        margin: 0 auto 16px;
        color: #e2e8f0;
      }
      .header h1 {
        margin: 0 0 8px;
        font-size: 24px;
      }
      .header p {
        margin: 0;
        color: #94a3b8;
      }
      #swagger-ui {
        max-width: 1200px;
        margin: 0 auto;
      }
      .swagger-ui .topbar {
        display: none;
      }
      .swagger-ui .scheme-container {
        background: rgba(15, 23, 42, 0.9);
        box-shadow: none;
        border: 1px solid rgba(34, 211, 238, 0.24);
        border-radius: 18px;
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <div class="header">
        <h1>${escapeHtml(title)}</h1>
        <p>Use Authorize para informar o JWT e testar as rotas protegidas.</p>
      </div>
      <div id="swagger-ui"></div>
    </div>
    <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      SwaggerUIBundle({
        url: ${JSON.stringify(specUrl)},
        dom_id: "#swagger-ui",
        deepLinking: true,
        persistAuthorization: true,
        displayRequestDuration: true,
        defaultModelsExpandDepth: 1
      });
    </script>
  </body>
</html>`;
