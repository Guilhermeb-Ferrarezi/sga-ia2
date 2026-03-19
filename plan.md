# Plano de Implementacao - SGA IA (WhatsApp Bot)

> Bot/IA no WhatsApp via WhatsApp Cloud API da Meta para gestao de campeonatos esportivos.
> Stack: Bun + Prisma + PostgreSQL + Redis | React + Vite + Tailwind + shadcn/Radix UI

---

## Legenda

- [x] Concluido
- [ ] Pendente
- [~] Em andamento

---

## FASE 1 - Infraestrutura e base (CONCLUIDA)

### 1.1 Backend e banco de dados
- [x] Configurar projeto com Bun + TypeScript
- [x] Configurar Prisma com PostgreSQL
- [x] Criar schema com 15 modelos (Contact, Message, User, Faq, Tag, etc.)
- [x] Implementar sistema de cache com Redis (fallback para DB)
- [x] Configurar Cloudflare R2 para armazenamento de audios
- [x] Criar middleware de autenticacao JWT
- [x] Implementar WebSocket para atualizacoes em tempo real
- [x] Criar sistema de alertas operacionais

### 1.2 Integracao WhatsApp Cloud API
- [x] Configurar webhook POST /webhook para receber mensagens
- [x] Processar mensagens de texto
- [x] Processar mensagens de audio (download + transcricao)
- [x] Enviar respostas via API do WhatsApp
- [x] Deduplicar mensagens por ID (TTL 10min no Redis)
- [x] Marcar mensagens como lidas automaticamente

### 1.3 Integracao OpenAI
- [x] Integrar com gpt-4o-mini para respostas contextuais
- [x] Configurar persona do bot via AiSettings (singleton no DB)
- [x] Injetar FAQs como contexto no prompt do sistema
- [x] Injetar historico de mensagens na conversa
- [x] Extrair dados de triagem automaticamente (JSON structured)

### 1.4 Dashboard Web
- [x] Configurar React + Vite + Tailwind + shadcn/Radix UI
- [x] Criar layout responsivo com sidebar e header
- [x] Implementar autenticacao com contexto React
- [x] Criar 13 paginas: Dashboard, Conversas, Pipeline, Contatos, Fila de Handoff, FAQs, Templates, Tags, Tarefas, Audios, Usuarios, Perfil WhatsApp, Configuracoes
- [x] Implementar WebSocket no frontend para atualizacoes em tempo real
- [x] Criar contexto de notificacoes toast

### 1.5 RBAC (Controle de acesso)
- [x] Criar sistema com 28 permissoes granulares
- [x] Implementar 4 perfis pre-definidos (admin, manager, agent, viewer)
- [x] Suporte a roles customizadas
- [x] Proteger rotas do dashboard por permissao

### 1.6 Deploy
- [x] Criar Dockerfiles para API e Web
- [x] Criar docker-compose.yml com todos os servicos
- [x] Criar script deploy_and_push.bat para deploy automatizado

---

## FASE 2 - Triagem e coleta de leads (CONCLUIDA)

### 2.1 Triagem automatica
- [x] Extrair campeonato de interesse via IA
- [x] Extrair data pretendida
- [x] Extrair categoria
- [x] Extrair cidade
- [x] Extrair time/jogadores
- [x] Extrair contagem de jogadores
- [x] Marcar triagem como completa quando todos os campos preenchidos

### 2.2 Coleta de leads
- [x] Capturar nome do contato
- [x] Capturar telefone (vem do WhatsApp automaticamente)
- [x] Capturar e-mail (opcional, via conversa)
- [x] Criar contato automaticamente no primeiro contato
- [x] Registrar historico completo de mensagens (USER, AI, AGENT, SYSTEM)
- [x] Log de auditoria para todas as alteracoes em contatos

### 2.3 Pipeline de vendas
- [x] Criar estagios configuráveis do pipeline
- [x] Mover contato automaticamente para primeiro estagio apos qualificacao
- [x] Visualizacao Kanban no dashboard
- [x] Drag-and-drop entre estagios

---

## FASE 3 - Handoff e atendimento humano (CONCLUIDA)

### 3.1 Escalonamento para humano
- [x] Detectar palavras-chave de escalonamento (falar com humano, atendente, etc.)
- [x] Criar fila de handoff com estados: NONE > QUEUED > ASSIGNED > IN_PROGRESS > RESOLVED
- [x] Rastrear SLA: aviso em 15min, critico em 30min
- [x] Registrar timestamps de cada transicao
- [x] Atribuir agente responsavel
- [x] Alerta operacional quando fila esta cheia

### 3.2 Interface de handoff
- [x] Pagina de fila de handoff no dashboard
- [x] Aceitar/rejeitar atendimentos
- [x] Visualizar conversa completa do contato
- [x] Enviar mensagens como agente humano

---

## FASE 4 - Tags e enriquecimento (CONCLUIDA)

### 4.1 Sistema de tags
- [x] Criar modelo Tag + ContactTag no banco
- [x] CRUD completo de tags no dashboard
- [x] Associar tags a contatos manualmente
- [x] Visualizar tags nos contatos

### 4.2 Auto-tagging
- [x] Regra: tag de urgencia baseada no comportamento
- [x] Regra: tag de tamanho do time
- [x] Regra: tag de nivel de habilidade
- [x] Aplicar tags automaticamente durante a triagem

---

## FASE 5 - Reestruturacao da base de conhecimento (PENDENTE)

### 5.1 Novo modelo de FAQ
- [ ] Migrar de pergunta+resposta isolada para estrutura por assunto
- [ ] Criar campo de categoria/tipo no modelo Faq (campeonato, edicao, produto, evento)
- [ ] Adicionar campo de edicao/temporada para separar conteudos por periodo
- [ ] Consolidar em cada item: valores, regras, datas, premiacoes, observacoes
- [ ] Criar editor rico no dashboard para conteudo estruturado
- [ ] Impedir mistura de dados entre campeonatos e edicoes diferentes

### 5.2 Busca semantica
- [ ] Implementar busca por similaridade em vez de correspondencia exata
- [ ] Usar embeddings (OpenAI text-embedding-3-small) para indexar conteudo
- [ ] Buscar os top-K itens mais relevantes para a pergunta do usuario
- [ ] Injetar apenas os itens relevantes no prompt (em vez de todas as FAQs)
- [ ] Ensinar o bot a dizer "nao tenho informacao sobre isso" quando nao houver match
- [ ] Evitar respostas inventadas com instrucao explicita no system prompt

### 5.3 Gestao de conteudo no dashboard
- [ ] Criar interface de edicoes/temporadas
- [ ] Filtrar FAQs por campeonato, edicao e categoria
- [ ] Preview de como o bot usaria cada conteudo
- [ ] Indicador de cobertura: quais assuntos tem conteudo e quais nao

---

## FASE 6 - Qualificacao avancada de leads (PENDENTE)

### 6.1 Coleta natural durante conversa
- [ ] Configurar perguntas de qualificacao no AiSettings
- [ ] Bot faz perguntas de forma leve e conversacional (nao interrogatorio)
- [ ] Capturar: jogo que pratica, se ja tem time, experiencia competitiva
- [ ] Capturar: produto/edicao de interesse especifico
- [ ] Capturar: orcamento ou expectativa de investimento
- [ ] Salvar respostas de qualificacao como campos estruturados no contato

### 6.2 Score de lead
- [ ] Calcular score baseado em completude dos dados
- [ ] Calcular score baseado em engajamento (qtd mensagens, tempo de resposta)
- [ ] Calcular score baseado em intencao detectada pela IA
- [ ] Exibir score no dashboard com indicador visual
- [ ] Ordenar contatos por score na listagem

### 6.3 Tags automaticas avancadas
- [ ] Tag por jogo mencionado (Valorant, CS2, LoL, etc.)
- [ ] Tag "tem time" vs "procurando time"
- [ ] Tag "interessado em mix" baseado na conversa
- [ ] Tag de faixa de orcamento
- [ ] Tag de urgencia (quer jogar esta semana, proximo mes, etc.)
- [ ] Tags visiveis e editaveis pela equipe comercial

---

## FASE 7 - Animacoes e UX avancada (PENDENTE)

### 7.1 Animacoes globais
- [ ] Adicionar framer-motion ao projeto web
- [ ] Animacao de entrada/saida em todas as paginas (page transitions)
- [ ] Animacao de fade-in nos cards do dashboard
- [ ] Animacao de slide nos menus e sidebar
- [ ] Animacao de scale nas interacoes de hover em botoes e cards
- [ ] Animacao suave no drag-and-drop do pipeline Kanban
- [ ] Skeleton loading animado em todas as listas

### 7.2 Animacoes em componentes
- [ ] Toast notifications com slide + fade
- [ ] Modais com scale + backdrop blur animado
- [ ] Tabelas com stagger animation nas linhas
- [ ] Badges e tags com pulse/glow effect
- [ ] Contadores do dashboard com animacao de contagem (count-up)
- [ ] Graficos com animacao de desenho progressivo
- [ ] Indicadores de status com animacao de pulso
- [ ] Transicoes suaves entre estados de loading/loaded/error

### 7.3 Micro-interacoes
- [ ] Ripple effect nos botoes
- [ ] Animacao de check nos toggles e checkboxes
- [ ] Feedback visual animado em formularios (sucesso/erro)
- [ ] Animacao de digitacao no chat/conversa
- [ ] Notificacao de nova mensagem com bounce
- [ ] Scroll suave e parallax em listas longas

---

## FASE 8 - Melhorias e integracao (PENDENTE)

### 8.1 Notificacoes
- [ ] Notificacao por e-mail quando handoff nao atendido no SLA
- [ ] Notificacao push no desktop/mobile para novos leads
- [ ] Notificacao sonora no dashboard para mensagens novas
- [ ] Resumo diario de leads por e-mail

### 8.2 Relatorios e analytics
- [ ] Dashboard com metricas avancadas: tempo medio de resposta, taxa de conversao
- [ ] Relatorio de leads por periodo
- [ ] Relatorio de performance por agente
- [ ] Exportar dados em CSV/Excel
- [ ] Graficos de tendencia (leads por dia/semana/mes)

### 8.3 Operacoes em massa
- [ ] Importar contatos via CSV
- [ ] Exportar contatos com filtros
- [ ] Aplicar tags em massa
- [ ] Mover contatos em massa no pipeline
- [ ] Enviar mensagem template em massa (respeitando limites da API)

### 8.4 Caracteres especiais e i18n
- [x] Respostas sem erros de acentuacao (processamento via OpenAI)
- [ ] Validar encoding UTF-8 em todas as camadas
- [ ] Testar emojis e caracteres especiais no envio/recebimento
- [ ] Garantir que templates de mensagem suportam acentos

---

## FASE 9 - Apps nativos (FUTURO)

### 9.1 App mobile (React Native/Expo)
- [ ] Tela de login
- [ ] Dashboard resumido
- [ ] Notificacoes push nativas
- [ ] Visualizar e responder conversas
- [ ] Aceitar handoffs pela mobile

### 9.2 App desktop (Electron)
- [ ] Wrapper do dashboard web
- [ ] Notificacoes nativas do sistema
- [ ] Atalhos de teclado para acoes rapidas
- [ ] Badge no icone da taskbar para mensagens pendentes

---

## Ordem de prioridade para implementacao

| Prioridade | Fase | Descricao | Motivo |
|------------|------|-----------|--------|
| 1 | Fase 5 | Reestruturar FAQ + busca semantica | Base para respostas precisas |
| 2 | Fase 6 | Qualificacao avancada de leads | Valor comercial direto |
| 3 | Fase 7 | Animacoes e UX avancada | Requisito explicito (#10) |
| 4 | Fase 8.4 | Caracteres especiais | Requisito explicito (#7) |
| 5 | Fase 8.1 | Notificacoes | Operacao mais eficiente |
| 6 | Fase 8.2 | Relatorios | Visibilidade de resultados |
| 7 | Fase 8.3 | Operacoes em massa | Escala operacional |
| 8 | Fase 9 | Apps nativos | Acessibilidade multiplataforma |

---

## Resumo de status

| Area | Status | Itens prontos | Itens pendentes |
|------|--------|---------------|-----------------|
| Infraestrutura | Concluida | 26 | 0 |
| Triagem e leads | Concluida | 16 | 0 |
| Handoff | Concluido | 10 | 0 |
| Tags basicas | Concluido | 8 | 0 |
| Base de conhecimento | Pendente | 0 | 13 |
| Qualificacao avancada | Pendente | 0 | 17 |
| Animacoes | Pendente | 0 | 18 |
| Melhorias gerais | Pendente | 1 | 12 |
| Apps nativos | Futuro | 0 | 9 |
| **TOTAL** | | **61** | **69** |
