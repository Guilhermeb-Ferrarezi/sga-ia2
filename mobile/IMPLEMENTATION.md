Here's the content of /memories/session/mobile_frontend_inventory.md with line numbers:
     1	# Frontend Functionality Inventory for React Native Migration
     2	
     3	**Project**: SG Esports IA - Mobile Implementation  
     4	**Backend**: Bun.js TypeScript API  
     5	**Frontend Source**: React 18 + TypeScript (web/src)  
     6	**Mobile Target**: React Native  
     7	
     8	---
     9	
    10	## 📱 Pages/Screens to Implement
    11	
    12	### 1. **LoginPage** (`web/src/pages/LoginPage.tsx`)
    13	- **Purpose**: User authentication entry point
    14	- **Features**:
    15	  - Email/password form submission
    16	  - Auth error display
    17	  - Loading state during login
    18	  - Glass panel design
    19	- **State**: email, password, loading, error
    20	- **Dependencies**: `useAuth()` context
    21	- **API Call**: `api.login(email, password)` → returns token + user
    22	
    23	### 2. **DashboardPage** (`web/src/pages/DashboardPage.tsx`)
    24	- **Purpose**: Main authenticated app container/shell
    25	- **Features**:
    26	  - Header with connection status & alerts
    27	  - Sidebar navigation with badge indicators
    28	  - Mobile menu toggle
    29	  - Nested routing with Outlet → other pages
    30	  - Notification listener initialization
    31	  - OperationalAlertsProvider
    32	- **State**: mobileMenuOpen (boolean)
    33	- **Layout**: Fixed height screen (h-screen)
    34	
    35	### 3. **OverviewTab** → Dashboard/Home Screen
    36	- **Purpose**: Dashboard home with key metrics
    37	- **Features**:
    38	  - Show metrics cards: total messages, user messages, assistant messages, total contacts
    39	  - Operational alerts: overdue tasks, pending handoffs, critical handoffs
    40	  - Recent 5 conversations with last message preview
    41	  - Pipeline stage distribution
    42	  - Task summary by status
    43	  - Funnel metrics (stage conversion rates)
    44	  - Real-time updates via WebSocket
    45	- **API Calls**:
    46	  - `api.overview(token)` → DashboardOverview
    47	  - `api.alertsSummary(token)` → OperationalAlertsSummary
    48	  - `api.conversations(token, limit)` → DashboardConversation[]
    49	  - `api.pipelineBoard(token)` → PipelineBoard
    50	  - `api.funnelMetrics(token)` → FunnelStageMetric[]
    51	
    52	### 4. **ConversationsTab** → Conversations/Messages Screen
    53	- **Purpose**: View conversation history with contacts
    54	- **Features**:
    55	  - Virtual scrolled list of conversations (60 per page)
    56	  - Contact selection with URL/navigation sync
    57	  - Last message preview & timestamp
    58	  - Message count per conversation
    59	  - Real-time message count updates via WS
    60	  - Refresh button
    61	  - Skeleton loading state
    62	- **Sub-component**: ConversationDetail (message history panel)
    63	  - Message history with pagination (120 msgs)
    64	  - Load older messages on scroll (backward pagination)
    65	  - Bot enable/disable toggle for contact
    66	  - Send message functionality
    67	  - Parse audio attachments: `[AUDIO:url|title]` format → show AudioPlayer
    68	  - Timestamp formatting
    69	  - Auto-scroll to latest
    70	  - AI processing status indicator
    71	  - Real-time message arrival via WS
    72	- **API Calls**:
    73	  - `api.conversations(token, limit)` → list
    74	  - `api.conversationTurns(token, phone, limit)` → get message history
    75	  - `api.sendMessage(token, waId, message)` → send
    76	  - `api.toggleBot(token, waId, enabled)` → toggle
    77	
    78	### 5. **ContactsPage** → Contacts/CRM Screen
    79	- **Purpose**: Manage customer records with search, filters, batch ops
    80	- **Features**:
    81	  - Virtual scrolled list (120 contacts per page)
    82	  - **Inline editing** of contact fields in cards
    83	  - Lead status dropdown (open/won/lost)
    84	  - Tag add/remove with tag picker modal
    85	  - Bot enable/disable toggle switch
    86	  - Handoff request button
    87	  - Batch select with checkboxes
    88	  - Batch operations: change status, add/remove tags in bulk
    89	  - Search by name/waId/email
    90	  - Saved filters to localStorage (search, status, bot, handoff)
    91	  - Audit log viewer modal (shows who changed what & when)
    92	  - Real-time updates via WS
    93	  - Retry logic for failed edits
    94	- **Fields editable inline**:
    95	  - name, email, tournament, eventDate, category, city, teamName, playersCount
    96	  - stageId (dropdown), leadStatus, source, notes, age, level, objective
    97	  - triageCompleted (checkbox), botEnabled (toggle)
    98	- **API Calls**:
    99	  - `api.pipelineBoard(token)` → get all contacts + stages
   100	  - `api.updateContact(token, waId, data)` → edit
   101	  - `api.updateContactLeadStatus(token, waId, status)` → change status
   102	  - `api.toggleBot(token, waId, enabled)` → toggle bot
   103	  - `api.addContactTag(token, waId, tagId)` → add tag
   104	  - `api.removeContactTag(token, waId, tagId)` → remove tag
   105	  - `api.batchContacts(token, waIds, action, extra)` → batch ops
   106	  - `api.deleteContact(token, waId)` → delete
   107	  - `api.contactAuditLog(token, waId)` → audit log
   108	
   109	### 6. **PipelineBoard** → Kanban/Pipeline Screen
   110	- **Purpose**: Visual drag-and-drop contact pipeline management
   111	- **Features**:
   112	  - Kanban columns for each pipeline stage + "Unassigned" section
   113	  - Virtual scrolling within each column
   114	  - **Drag-and-drop** contact cards between stages
   115	  - Contact card click → open detail modal
   116	  - **Inline edit** contact fields in modal (same as contacts page)
   117	  - Lead status (open/won/lost)
   118	  - Bot enable/disable
   119	  - Handoff request trigger
   120	  - Tag management
   121	  - Saved filters (search, custom filters)
   122	  - Real-time stage updates via WS
   123	  - Retry on failed moves
   124	  - Batch operations
   125	- **API Calls**: Same as ContactsPage mostly
   126	- **Note**: On drag-drop → `api.updateContact(token, waId, { stageId: newStageId })`
   127	
   128	### 7. **HandoffQueuePage** → Handoff/Support Queue Screen
   129	- **Purpose**: Manage human handoff requests with SLA tracking
   130	- **Features**:
   131	  - Queue list filtered by assigned/unassigned
   132	  - SLA status indicator (ok/warning/critical) - color coded
   133	  - Wait time calculation (minutes since handoffAt)
   134	  - Contact name & phone
   135	  - Last message from conversation
   136	  - Open tasks for that contact (title, dueAt, status, priority)
   137	  - Agent assignment info (who, when)
   138	  - Actions: Assume handoff, Release handoff, Resume bot
   139	  - Real-time queue updates via WS
   140	  - Refresh button
   141	- **API Calls**:
   142	  - `api.handoffQueue(token, options)` → HandoffQueueItem[]
   143	  - `api.assignHandoff(token, waId, owner)` → assign to agent
   144	
   145	### 8. **TasksPage** → Tasks/Todo Screen
   146	- **Purpose**: Manage operational tasks with priority & status
   147	- **Features**:
   148	  - Task list with filtering by status (open/in_progress/done/cancelled)
   149	  - Filter by priority (low/medium/high/urgent)
   150	  - Create new task form (title, description, contact, due date, status, priority)
   151	  - Edit task inline or in modal
   152	  - Delete task
   153	  - Status and priority badges with color coding
   154	  - Contact selector dropdown (loads from pipeline board)
   155	  - DateTime picker for due date
   156	  - Real-time updates via WS
   157	- **API Calls**:
   158	  - `api.tasks(token, { status?, priority?, limit, offset })` → Task[]
   159	  - `api.createTask(token, data)` → create
   160	  - `api.updateTask(token, id, data)` → edit
   161	  - `api.deleteTask(token, id)` → delete
   162	  - `api.pipelineBoard(token)` → get contacts for selector
   163	
   164	### 9. **FaqsPage** → FAQs Screen
   165	- **Purpose**: Manage FAQ database for chatbot training
   166	- **Features**:
   167	  - Paginated list (10 per page)
   168	  - Search by question/answer text
   169	  - Filter by active/inactive status
   170	  - Toggle active/inactive status
   171	  - Create new FAQ modal form
   172	  - Edit existing FAQ
   173	  - Delete FAQ
   174	- **API Calls**:
   175	  - `api.faqs(token, { search?, isActive?, limit, offset })` → Faq[]
   176	  - `api.createFaq(token, data)` → create
   177	  - `api.updateFaq(token, id, data)` → update
   178	  - `api.deleteFaq(token, id)` → delete
   179	
   180	### 10. **TemplatesPage** → Templates Screen
   181	- **Purpose**: Message templates for quick responses
   182	- **Features**:
   183	  - Paginated list (10 per page)
   184	  - Create/edit/delete templates
   185	  - Categorize messages
   186	  - Search by title/body
   187	  - Filter by category
   188	  - Form textarea for message content
   189	- **API Calls**:
   190	  - `api.templates(token, { search?, category?, limit, offset })` → MessageTemplate[]
   191	  - `api.createTemplate(token, data)` → create
   192	  - `api.updateTemplate(token, id, data)` → update
   193	  - `api.deleteTemplate(token, id)` → delete
   194	
   195	### 11. **TagsPage** → Tags Screen
   196	- **Purpose**: Manage contact tags with colors
   197	- **Features**:
   198	  - Paginated list (20 per page)
   199	  - Create/edit/delete tags
   200	  - Color picker (8 presets + custom hex input)
   201	  - Live tag badge preview with chosen color
   202	  - Search by name
   203	- **API Calls**:
   204	  - `api.tags(token, { search?, limit, offset })` → Tag[]
   205	  - `api.createTag(token, data)` → create
   206	  - `api.updateTag(token, id, data)` → update
   207	  - `api.deleteTag(token, id)` → delete
   208	
   209	### 12. **AudiosPage** → Audio Library Screen
   210	- **Purpose**: Manage audio files for chatbot responses
   211	- **Features**:
   212	  - Audio file upload with progress bar
   213	  - Paginated list (10 per page)
   214	  - Audio metadata: title, filename, size (human-readable), category
   215	  - Audio player (play/pause/seek/time display)
   216	  - Edit audio title/category
   217	  - Delete audio
   218	  - Search by title
   219	  - Filter by category
   220	  - Format bytes display (B, KB, MB)
   221	  - Error toast on audio playback failure
   222	- **API Calls**:
   223	  - `api.audios(token, { search?, category?, limit, offset })` → Audio[]
   224	  - `api.uploadAudio(token, file, { title, category })` → create
   225	  - `api.updateAudio(token, id, data)` → update
   226	  - `api.deleteAudio(token, id)` → delete
   227	  - Audio playback: `/audios/:id/stream` or `/audios/stream-url?url=`
   228	
   229	### 13. **CreateUserPage** → Admin: Create User Screen
   230	- **Purpose**: Admin only - create new dashboard users
   231	- **Features**:
   232	  - Email input (required, must be valid email)
   233	  - Password input (required, min 6 chars)
   234	  - Name input (optional)
   235	  - Role dropdown: ADMIN or AGENT
   236	  - Form validation
   237	  - Submit button (disabled if invalid)
   238	  - Restrict access to ADMIN users only (show "Access restricted" otherwise)
   239	  - Success/error toast feedback
   240	- **API Calls**:
   241	  - `api.createUser(token, { email, password, name?, role })` → AuthUser
   242	
   243	---
   244	
   245	## 🎨 Core Components/UI Elements
   246	
   247	### Layout Components
   248	- **Header**: Top bar with connection status (connected/reconnecting/disconnected), operational alerts count, user avatar, logout button
   249	- **Sidebar/Navigation**: Menu drawer with 11 navigation links + logout button at footer, badge indicators on handoffs/tasks
   250	- **LoadingScreen**: Full-page spinner with title & description (for page transitions)
   251	
   252	### Form Components
   253	- **Input**: Text input field
   254	- **Textarea**: Multi-line text input
   255	- **Label**: Form field label
   256	- **Button**: CTA with variants (default, secondary, destructive, outline, ghost) and sizes (sm, default, lg, icon)
   257	- **Select/Picker**: Dropdown selector (for status, priority, contact, role, category)
   258	- **ColorPicker**: Color selection with preset swatches + hex input
   259	- **DateTimeInput**: Date & time picker for task due dates
   260	
   261	### Display Components
   262	- **Card**: Container for content sections
   263	- **Badge**: Status/tag display with color variants
   264	- **Avatar**: User avatar with initials fallback
   265	- **TagBadge**: Inline tag display with optional remove button
   266	- **AudioPlayer**: Audio controls (play/pause, seek, time display)
   267	- **Checkbox**: Multi-select checkbox
   268	- **Switch**: Toggle on/off
   269	- **Tabs**: Tab navigation between sub-views (if needed)
   270	- **Separator**: Divider line
   271	
   272	---
   273	
   274	## 🔌 API Services Required
   275	
   276	### Base URL
   277	```
   278	POST /auth/login
   279	  → { email, password } → { token, user }
   280	
   281	GET /auth/me (requires Bearer token)
   282	  → { user: AuthUser }
   283	
   284	POST /users (admin only)
   285	  → { email, password, name?, role? } → AuthUser
   286	
   287	GET /dashboard/overview
   288	  → DashboardOverview
   289	
   290	GET /dashboard/alerts
   291	  → OperationalAlertsSummary
   292	
   293	GET /dashboard/conversations?limit=
   294	  → DashboardConversation[]
   295	
   296	GET /dashboard/conversations/:phone?limit=
   297	  → DashboardTurn[]
   298	
   299	POST /contacts
   300	  → { waId, ...fields } → PipelineContact
   301	
   302	GET /pipeline/board
   303	  → { stages: [...], unassigned: [...] }
   304	
   305	PUT /contacts/:waId
   306	  → { ...fields } → PipelineContact
   307	
   308	PUT /contacts/:waId/stage
   309	  → { stageId } → ?
   310	
   311	PUT /contacts/:waId/status
   312	  → { leadStatus } → ?
   313	
   314	PUT /contacts/:waId/bot
   315	  → { enabled } → ?
   316	
   317	POST /contacts/:waId/send
   318	  → { message } → ?
   319	
   320	POST /contacts/:waId/tags
   321	  → { tagId } → ?
   322	
   323	DELETE /contacts/:waId/tags/:tagId
   324	  → ?
   325	
   326	GET /contacts/:waId/audit
   327	  → AuditLogEntry[]
   328	
   329	DELETE /contacts/:waId
   330	  → ?
   331	
   332	POST /contacts/batch
   333	  → { waIds, action, ...extra } → { count }
   334	
   335	GET /pipeline/stages
   336	  → PipelineStage[]
   337	
   338	GET /pipeline/funnel
   339	  → FunnelStageMetric[]
   340	
   341	GET /handoff/queue?assigned=
   342	  → HandoffQueueItem[]
   343	
   344	PUT /handoff/queue/:waId
   345	  → { owner } → ?
   346	
   347	GET /faqs?search=&isActive=&limit=&offset=
   348	  → { items, total, limit, offset }
   349	
   350	POST /faqs
   351	  → { question, answer, isActive? } → Faq
   352	
   353	PUT /faqs/:id
   354	  → { ...fields } → Faq
   355	
   356	DELETE /faqs/:id
   357	  → ?
   358	
   359	GET /templates?search=&category=&limit=&offset=
   360	  → { items, total, limit, offset }
   361	
   362	POST /templates
   363	  → { title, body, category? } → MessageTemplate
   364	
   365	PUT /templates/:id
   366	  → { ...fields } → MessageTemplate
   367	
   368	DELETE /templates/:id
   369	  → ?
   370	
   371	GET /tags?search=&limit=&offset=
   372	  → { items, total, limit, offset }
   373	
   374	POST /tags
   375	  → { name, color? } → Tag
   376	
   377	PUT /tags/:id
   378	  → { name?, color? } → Tag
   379	
   380	DELETE /tags/:id
   381	  → ?
   382	
   383	GET /tasks?status=&priority=&limit=&offset=
   384	  → { items, total, limit, offset }
   385	
   386	POST /tasks
   387	  → { waId, title, description?, dueAt, status?, priority? } → Task
   388	
   389	PUT /tasks/:id
   390	  → { ...fields } → Task
   391	
   392	DELETE /tasks/:id
   393	  → ?
   394	
   395	GET /audios?search=&category=&limit=&offset=
   396	  → { items, total, limit, offset }
   397	
   398	POST /audios (form-data: file, title, category)
   399	  → Audio
   400	
   401	PUT /audios/:id
   402	  → { title?, category? } → Audio
   403	
   404	DELETE /audios/:id
   405	  → ?
   406	
   407	GET /audios/:id/stream
   408	  → binary audio file
   409	
   410	GET /audios/stream-url?url=<encoded>
   411	  → binary audio file
   412	```
   413	
   414	---
   415	
   416	## 🔄 WebSocket Events to Subscribe
   417	
   418	### Events to listen for real-time updates:
   419	- `bot:heartbeat` → Keep alive
   420	- `notification` → New message notification
   421	- `message:new` → New message in conversation
   422	- `message:sent` → Message sent confirmation
   423	- `ai:processing` → AI is processing
   424	- `ai:done` → AI finished
   425	- `contact:updated` → Contact data changed
   426	- `contact:deleted` → Contact deleted
   427	- `contact:qualified` → Contact moved to first stage
   428	- `handoff:updated` → Handoff status changed
   429	- `task:updated` → Task changed
   430	- `pipeline:updated` → Pipeline stages/contacts changed
   431	- `overview:updated` → Dashboard overview metrics changed
   432	- `alerts:summary` → Operational alerts updated
   433	
   434	### WebSocket Connection
   435	- URL: Determined by `api.getWsUrl(token)` → wss://...?token=JWT
   436	- Reconnection: Exponential backoff with max retries
   437	- Status: connected | reconnecting | disconnected
   438	- Port: 3001 (check config)
   439	
   440	---
   441	
   442	## 🔐 Authentication Flow
   443	
   444	1. User enters email + password on LoginPage
   445	2. Call `api.login(email, password)` → returns JWT token + AuthUser
   446	3. Store token in secure storage (AsyncStorage or similar)
   447	4. Save token to AuthContext state
   448	5. On app start, retrieve stored token → call `api.me(token)` to validate session
   449	6. On logout → clear token from storage & context
   450	
   451	---
   452	
   453	## 💾 State Management
   454	
   455	### AuthContext (App-wide)
   456	```typescript
   457	{
   458	  token: string | null,
   459	  user: AuthUser | null,
   460	  bootLoading: boolean,
   461	  login: (email, password) => Promise<void>,
   462	  logout: () => void
   463	}
   464	```
   465	
   466	### WebSocketContext (Dashboard subtree)
   467	```typescript
   468	{
   469	  status: "connected" | "reconnecting" | "disconnected",
   470	  lastHeartbeat: number | null,
   471	  subscribe: (handler) => unsubscribe,
   472	  subscribeFiltered: (handler, filter) => unsubscribe
   473	}
   474	```
   475	
   476	### ToastContext (App-wide)
   477	```typescript
   478	{
   479	  toast: ({ title, description?, variant?, durationMs? }) => void,
   480	  dismissToast: (id) => void
   481	}
   482	```
   483	
   484	### OperationalAlertsContext (Dashboard subtree)
   485	```typescript
   486	{
   487	  summary: OperationalAlertsSummary,
   488	  refresh: () => Promise<void>
   489	}
   490	```
   491	
   492	---
   493	
   494	## 📊 Key Data Types
   495	
   496	### Authentication
   497	```typescript
   498	interface AuthUser {
   499	  id: string;
   500	  email: string;
   501	  name: string | null;
   502	  role: "ADMIN" | "AGENT";
   503	  createdAt: string; // ISO
   504	}
   505	```
   506	
   507	### Contacts
   508	```typescript
   509	interface PipelineContact {
   510	  id: number;
   511	  waId: string; // WhatsApp ID
   512	  name: string | null;
   513	  email: string | null;
   514	  tournament: string | null;
   515	  eventDate: string | null;
   516	  category: string | null;
   517	  city: string | null;
   518	  teamName: string | null;
   519	  playersCount: number | null;
   520	  stageId: number | null;
   521	  leadStatus: "open" | "won" | "lost";
   522	  triageCompleted: boolean;
   523	  handoffRequested: boolean;
   524	  handoffReason: string | null;
   525	  handoffAt: string | null;
   526	  source: string | null;
   527	  notes: string | null;
   528	  age: string | null;
   529	  level: string | null;
   530	  objective: string | null;
   531	  botEnabled: boolean;
   532	  lastInteractionAt: string | null;
   533	  createdAt: string;
   534	  tags: ContactTag[];
   535	}
   536	
   537	interface Tag {
   538	  id: number;
   539	  name: string;
   540	  color: string; // hex
   541	}
   542	
   543	interface ContactTag {
   544	  id: number;
   545	  contactId: number;
   546	  tagId: number;
   547	  tag: Tag;
   548	}
   549	```
   550	
   551	### Pipeline
   552	```typescript
   553	interface PipelineStage {
   554	  id: number;
   555	  name: string;
   556	  position: number;
   557	  color: string;
   558	  isActive: boolean;
   559	}
   560	
   561	interface PipelineBoard {
   562	  stages: Array<PipelineStage & { contacts: PipelineContact[] }>;
   563	  unassigned: PipelineContact[];
   564	}
   565	```
   566	
   567	### Tasks
   568	```typescript
   569	type TaskStatus = "open" | "in_progress" | "done" | "cancelled";
   570	type TaskPriority = "low" | "medium" | "high" | "urgent";
   571	
   572	interface Task {
   573	  id: number;
   574	  contactId: number;
   575	  title: string;
   576	  description: string | null;
   577	  dueAt: string; // ISO
   578	  status: TaskStatus;
   579	  priority: TaskPriority;
   580	  createdAt: string;
   581	  updatedAt: string;
   582	  completedAt: string | null;
   583	  contact: { id: number; waId: string; name: string | null };
   584	}
   585	```
   586	
   587	### Handoffs
   588	```typescript
   589	type HandoffSlaLevel = "ok" | "warning" | "critical";
   590	
   591	interface HandoffQueueItem {
   592	  waId: string;
   593	  name: string | null;
   594	  stage: { id: number; name: string; color: string } | null;
   595	  handoffReason: string | null;
   596	  handoffAt: string | null;
   597	  waitMinutes: number;
   598	  slaLevel: HandoffSlaLevel;
   599	  assignedTo: string | null;
   600	  assignedAt: string | null;
   601	  latestMessage: { body: string; createdAt: string } | null;
   602	  openTasks: Array<{ id: number; title: string; dueAt: string; status: string; priority: string }>;
   603	}
   604	```
   605	
   606	### Dashboard
   607	```typescript
   608	interface DashboardOverview {
   609	  totalMessages: number;
   610	  userMessages: number;
   611	  assistantMessages: number;
   612	  totalContacts: number;
   613	}
   614	
   615	interface OperationalAlertsSummary {
   616	  overdueTasks: number;
   617	  pendingHandoffs: number;
   618	  criticalHandoffs: number;
   619	  updatedAt: string;
   620	}
   621	
   622	interface FunnelStageMetric {
   623	  stageId: number;
   624	  stageName: string;
   625	  total: number;
   626	  won: number;
   627	  lost: number;
   628	  conversionRate: number;
   629	  avgHoursInStage: number | null;
   630	}
   631	```
   632	
   633	### Content
   634	```typescript
   635	interface Faq {
   636	  id: number;
   637	  question: string;
   638	  answer: string;
   639	  isActive: boolean;
   640	  createdAt: string;
   641	  updatedAt: string;
   642	}
   643	
   644	interface MessageTemplate {
   645	  id: number;
   646	  title: string;
   647	  body: string;
   648	  category: string;
   649	  createdAt: string;
   650	  updatedAt: string;
   651	}
   652	
   653	interface Audio {
   654	  id: number;
   655	  title: string;
   656	  filename: string;
   657	  r2Key: string;
   658	  url: string;
   659	  mimeType: string;
   660	  sizeBytes: number;
   661	  category: string;
   662	  createdAt: string;
   663	  updatedAt: string;
   664	}
   665	```
   666	
   667	---
   668	
   669	## 🚀 Implementation Priority
   670	
   671	**Phase 1 - Core**
   672	1. Auth flow (login, token storage, session validation)
   673	2. Navigation structure (authenticated shell, main routes)
   674	3. API client service
   675	
   676	**Phase 2 - Essential Dashboard**
   677	4. OverviewTab (home screen with metrics)
   678	5. ConversationsTab (messages list + detail)
   679	6. ContactsPage (CRM list with basic editing)
   680	
   681	**Phase 3 - Advanced Features**
   682	7. PipelineBoard (Kanban with drag-and-drop)
   683	8. TasksPage (task management)
   684	9. HandoffQueuePage (support queue)
   685	
   686	**Phase 4 - Admin & Content**
   687	10. CreateUserPage (user management)
   688	11. FaqsPage, TemplatesPage, TagsPage, AudiosPage (content management)
   689	
   690	---
   691	
   692	## 📝 Notes for React Native Implementation
   693	
   694	- Use React Navigation instead of React Router
   695	- Replace Tailwind CSS with NativeWind, React Native Paper, or custom Stylesheet
   696	- Use AsyncStorage for token/filter persistence
   697	- Mobile-optimized components (FlatList instead of virtual scrolling)
   698	- Use React Native WebSocket API
   699	- File upload: use expo-document-picker or react-native-image-picker
   700	- Audio playback: use react-native-sound or expo-av
   701	- Date/time picker: use react-native-date-picker
   702	- Drag-and-drop: use react-native-draggable-flatlist (simpler than web DnD)
   703	- Error boundaries: use ErrorBoundary component
   704	- Testing: Jest + React Native Testing Library
   705	