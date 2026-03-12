Here's the content of /memories/session/react_native_setup_guide.md with line numbers:
     1	# React Native Implementation Setup Guide
     2	
     3	## 📦 Recommended Libraries & Dependencies
     4	
     5	### Navigation
     6	```json
     7	{
     8	  "react-native": "^0.74.0",
     9	  "@react-navigation/native": "^6.1.17",
    10	  "@react-navigation/bottom-tabs": "^6.5.20",
    11	  "@react-navigation/drawer": "^6.6.15",
    12	  "@react-navigation/stack": "^6.3.29",
    13	  "react-native-screens": "^3.29.0",
    14	  "react-native-safe-area-context": "^4.10.5"
    15	}
    16	```
    17	
    18	### UI Components
    19	```json
    20	{
    21	  "react-native-paper": "^5.12.2",
    22	  "@react-native-community/hooks": "^3.0.0",
    23	  "react-native-vector-icons": "^10.0.3",
    24	  "@react-native-async-storage/async-storage": "^1.23.1"
    25	}
    26	```
    27	
    28	Or NativeWind approach:
    29	```json
    30	{
    31	  "nativewind": "^2.0.11",
    32	  "tailwindcss": "^3.4.1",
    33	  "react-native-reanimated": "^3.9.2"
    34	}
    35	```
    36	
    37	### Audio & Media
    38	```json
    39	{
    40	  "react-native-sound": "^0.11.2",
    41	  "expo-av": "^14.0.4",
    42	  "@react-native-camera/camera": "^5.0.0",
    43	  "react-native-fs": "^2.20.0"
    44	}
    45	```
    46	
    47	### Networking & WebSocket
    48	```json
    49	{
    50	  "axios": "^1.7.5",
    51	  "ws": "^8.15.1",
    52	  "@react-native-community/netinfo": "^11.3.1"
    53	}
    54	```
    55	
    56	### Forms & Validation
    57	```json
    58	{
    59	  "react-hook-form": "^7.51.3",
    60	  "zod": "^3.22.4"
    61	}
    62	```
    63	
    64	### Date & Time
    65	```json
    66	{
    67	  "react-native-date-picker": "^4.7.0",
    68	  "date-fns": "^3.0.0"
    69	}
    70	```
    71	
    72	### Drag & Drop
    73	```json
    74	{
    75	  "react-native-draggable-flatlist": "^0.9.5",
    76	  "react-native-gesture-handler": "^2.14.5"
    77	}
    78	```
    79	
    80	### File Handling
    81	```json
    82	{
    83	  "expo-document-picker": "^11.5.4",
    84	  "expo-image-picker": "^14.7.1",
    85	  "expo-file-system": "^15.4.5",
    86	  "rn-fetch-blob": "^0.12.0"
    87	}
    88	```
    89	
    90	### State & Context
    91	```json
    92	{
    93	  "zustand": "^4.4.1"
    94	}
    95	```
    96	Or stick with Context API (no new lib needed)
    97	
    98	### Utilities
    99	```json
   100	{
   101	  "lodash": "^4.17.21",
   102	  "uuid": "^9.0.1"
   103	}
   104	```
   105	
   106	### Testing
   107	```json
   108	{
   109	  "@testing-library/react-native": "^14.0.0",
   110	  "@testing-library/jest-native": "^5.4.3",
   111	  "jest": "^29.7.0"
   112	}
   113	```
   114	
   115	### Error & Debugging
   116	```json
   117	{
   118	  "react-native-exception-handler": "^1.4.0",
   119	  "sentry": "^7.91.0"
   120	}
   121	```
   122	
   123	---
   124	
   125	## 📁 Recommended Project Structure
   126	
   127	```
   128	mobile/
   129	├── src/
   130	│   ├── screens/
   131	│   │   ├── auth/
   132	│   │   │   └── LoginScreen.tsx
   133	│   │   ├── dashboard/
   134	│   │   │   ├── OverviewScreen.tsx
   135	│   │   │   ├── ConversationsScreen.tsx
   136	│   │   │   ├── ConversationDetailScreen.tsx
   137	│   │   │   └── ConversationDetailModal.tsx
   138	│   │   ├── contacts/
   139	│   │   │   ├── ContactsScreen.tsx
   140	│   │   │   ├── ContactDetailModal.tsx
   141	│   │   │   └── ContactEditModal.tsx
   142	│   │   ├── pipeline/
   143	│   │   │   ├── PipelineBoardScreen.tsx
   144	│   │   │   └── PipelineDetailModal.tsx
   145	│   │   ├── handoffs/
   146	│   │   │   └── HandoffQueueScreen.tsx
   147	│   │   ├── tasks/
   148	│   │   │   ├── TasksScreen.tsx
   149	│   │   │   └── TaskEditModal.tsx
   150	│   │   ├── faqs/
   151	│   │   │   ├── FaqsScreen.tsx
   152	│   │   │   └── FaqEditModal.tsx
   153	│   │   ├── templates/
   154	│   │   │   ├── TemplatesScreen.tsx
   155	│   │   │   └── TemplateEditModal.tsx
   156	│   │   ├── tags/
   157	│   │   │   ├── TagsScreen.tsx
   158	│   │   │   └── TagEditModal.tsx
   159	│   │   ├── audios/
   160	│   │   │   ├── AudiosScreen.tsx
   161	│   │   │   └── AudioUploadModal.tsx
   162	│   │   └── users/
   163	│   │       └── CreateUserScreen.tsx
   164	│   │
   165	│   ├── navigation/
   166	│   │   ├── RootNavigator.tsx
   167	│   │   ├── AuthNavigator.tsx
   168	│   │   ├── DashboardNavigator.tsx
   169	│   │   └── Types.ts
   170	│   │
   171	│   ├── components/
   172	│   │   ├── layout/
   173	│   │   │   ├── Header.tsx
   174	│   │   │   ├── BottomTabs.tsx
   175	│   │   │   └── Sidebar.tsx (drawer)
   176	│   │   ├── common/
   177	│   │   │   ├── Button.tsx
   178	│   │   │   ├── Input.tsx
   179	│   │   │   ├── Card.tsx
   180	│   │   │   ├── Badge.tsx
   181	│   │   │   ├── TextInput.tsx
   182	│   │   │   ├── TouchableButton.tsx
   183	│   │   │   ├── Modal.tsx
   184	│   │   │   ├── LoadingIndicator.tsx
   185	│   │   │   ├── ErrorBoundary.tsx
   186	│   │   │   └── Toast.tsx
   187	│   │   ├── dashboard/
   188	│   │   │   ├── MetricCard.tsx
   189	│   │   │   ├── AlertsBanner.tsx
   190	│   │   │   ├── RecentConversations.tsx
   191	│   │   │   └── PipelineStats.tsx
   192	│   │   ├── contacts/
   193	│   │   │   ├── ContactCard.tsx
   194	│   │   │   ├── ContactForm.tsx
   195	│   │   │   ├── TagSelector.tsx
   196	│   │   │   └── StatusSelector.tsx
   197	│   │   ├── pipeline/
   198	│   │   │   ├── StageColumn.tsx
   199	│   │   │   ├── ContactItem.tsx
   200	│   │   │   └── DragDropContainer.tsx
   201	│   │   ├── audio/
   202	│   │   │   ├── AudioPlayer.tsx
   203	│   │   │   └── AudioUploader.tsx
   204	│   │   └── pagination/
   205	│   │       ├── PaginatedFlatList.tsx
   206	│   │       └── LoadMoreButton.tsx
   207	│   │
   208	│   ├── contexts/
   209	│   │   ├── AuthContext.tsx
   210	│   │   ├── WebSocketContext.tsx
   211	│   │   ├── ToastContext.tsx
   212	│   │   ├── OperationalAlertsContext.tsx
   213	│   │   └── AppProviders.tsx
   214	│   │
   215	│   ├── hooks/
   216	│   │   ├── useAuth.ts
   217	│   │   ├── useWebSocket.ts
   218	│   │   ├── useToast.ts
   219	│   │   ├── useAudioPlayer.ts
   220	│   │   ├── useNotifications.ts
   221	│   │   ├── useRetry.ts
   222	│   │   ├── useSavedFilters.ts
   223	│   │   ├── usePagination.ts
   224	│   │   ├── useNetworkStatus.ts
   225	│   │   └── useScreenDimensions.ts
   226	│   │
   227	│   ├── services/
   228	│   │   ├── api/
   229	│   │   │   ├── client.ts (axios instance)
   230	│   │   │   ├── auth.ts
   231	│   │   │   ├── dashboard.ts
   232	│   │   │   ├── contacts.ts
   233	│   │   │   ├── pipeline.ts
   234	│   │   │   ├── handoffs.ts
   235	│   │   │   ├── tasks.ts
   236	│   │   │   ├── faqs.ts
   237	│   │   │   ├── templates.ts
   238	│   │   │   ├── audios.ts
   239	│   │   │   ├── tags.ts
   240	│   │   │   └── users.ts
   241	│   │   ├── storage/
   242	│   │   │   ├── tokenStorage.ts
   243	│   │   │   ├── filterStorage.ts
   244	│   │   │   └── cacheStorage.ts
   245	│   │   ├── websocket/
   246	│   │   │   ├── wsClient.ts
   247	│   │   │   └── wsHandlers.ts
   248	│   │   ├── audio/
   249	│   │   │   └── audioPlayback.ts
   250	│   │   └── notifications/
   251	│   │       └── notificationHandler.ts
   252	│   │
   253	│   ├── types/
   254	│   │   ├── index.ts
   255	│   │   ├── auth.ts
   256	│   │   ├── contact.ts
   257	│   │   ├── pipeline.ts
   258	│   │   ├── task.ts
   259	│   │   ├── handoff.ts
   260	│   │   ├── dashboard.ts
   261	│   │   ├── api.ts
   262	│   │   └── websocket.ts
   263	│   │
   264	│   ├── utils/
   265	│   │   ├── formatting.ts (date, bytes, time formatting)
   266	│   │   ├── validation.ts
   267	│   │   ├── colors.ts
   268	│   │   ├── constants.ts
   269	│   │   ├── env.ts
   270	│   │   └── logger.ts
   271	│   │
   272	│   ├── styles/
   273	│   │   ├── theme.ts
   274	│   │   ├── colors.ts
   275	│   │   ├── spacing.ts
   276	│   │   └── typography.ts
   277	│   │
   278	│   ├── App.tsx
   279	│   └── index.tsx
   280	│
   281	├── __tests__/
   282	│   ├── unit/
   283	│   ├── integration/
   284	│   └── e2e/
   285	│
   286	├── .env.example
   287	├── app.json
   288	├── package.json
   289	├── tsconfig.json
   290	├── babel.config.js
   291	└── metro.config.js
   292	```
   293	
   294	---
   295	
   296	## 🚀 Getting Started
   297	
   298	### 1. Create React Native Project
   299	```bash
   300	npx create-expo-app mobile
   301	cd mobile
   302	npm install
   303	```
   304	
   305	Or with TypeScript:
   306	```bash
   307	npx create-expo-app mobile --template
   308	```
   309	
   310	### 2. Install Core Dependencies
   311	```bash
   312	npm install react-native-paper @react-navigation/native @react-navigation/bottom-tabs
   313	npm install react-native-screens react-native-safe-area-context
   314	npm install @react-native-async-storage/async-storage
   315	npm install axios react-hook-form zod
   316	npm install date-fns
   317	```
   318	
   319	### 3. Setup Environment Variables
   320	Create `.env` file:
   321	```
   322	REACT_APP_API_BASE=http://192.168.1.100:3001
   323	REACT_APP_WS_BASE=ws://192.168.1.100:3001
   324	REACT_APP_ENV=development
   325	```
   326	
   327	Load in app:
   328	```typescript
   329	import { getEnvVariable } from './utils/env';
   330	const API_BASE = getEnvVariable('REACT_APP_API_BASE');
   331	```
   332	
   333	### 4. Create AppProviders Wrapper
   334	```typescript
   335	// src/contexts/AppProviders.tsx
   336	import React from 'react';
   337	import { AuthProvider } from './AuthContext';
   338	import { ToastProvider } from './ToastContext';
   339	import { WebSocketProvider } from './WebSocketContext';
   340	
   341	export const AppProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => (
   342	  <AuthProvider>
   343	    <ToastProvider>
   344	      <WebSocketProvider>
   345	        {children}
   346	      </WebSocketProvider>
   347	    </ToastProvider>
   348	  </AuthProvider>
   349	);
   350	```
   351	
   352	### 5. Setup API Client
   353	```typescript
   354	// src/services/api/client.ts
   355	import axios from 'axios';
   356	import { getEnvVariable } from '@/utils/env';
   357	import { getStoredToken } from '@/services/storage/tokenStorage';
   358	
   359	export const apiClient = axios.create({
   360	  baseURL: getEnvVariable('REACT_APP_API_BASE'),
   361	  timeout: 30000,
   362	});
   363	
   364	// Add token to all requests
   365	apiClient.interceptors.request.use(async (config) => {
   366	  const token = await getStoredToken();
   367	  if (token) {
   368	    config.headers.Authorization = `Bearer ${token}`;
   369	  }
   370	  return config;
   371	});
   372	
   373	// Handle 401 errors (auto-logout)
   374	apiClient.interceptors.response.use(
   375	  (response) => response,
   376	  (error) => {
   377	    if (error.response?.status === 401) {
   378	      // Trigger logout
   379	    }
   380	    return Promise.reject(error);
   381	  }
   382	);
   383	```
   384	
   385	### 6. Create Main Navigation
   386	```typescript
   387	// src/navigation/RootNavigator.tsx
   388	import React from 'react';
   389	import { NavigationContainer } from '@react-navigation/native';
   390	import { createNativeStackNavigator } from '@react-navigation/native-stack';
   391	import { useAuth } from '@/hooks/useAuth';
   392	import { LoginScreen } from '@/screens/auth/LoginScreen';
   393	import { DashboardNavigator } from './DashboardNavigator';
   394	
   395	const Stack = createNativeStackNavigator();
   396	
   397	export const RootNavigator = () => {
   398	  const { token, bootLoading } = useAuth();
   399	
   400	  if (bootLoading) {
   401	    return <LoadingScreen />;
   402	  }
   403	
   404	  return (
   405	    <NavigationContainer>
   406	      <Stack.Navigator screenOptions={{ headerShown: false }}>
   407	        {!token ? (
   408	          <Stack.Screen name="Auth" component={LoginScreen} />
   409	        ) : (
   410	          <Stack.Screen name="Dashboard" component={DashboardNavigator} />
   411	        )}
   412	      </Stack.Navigator>
   413	    </NavigationContainer>
   414	  );
   415	};
   416	```
   417	
   418	---
   419	
   420	## 📱 Screen-by-Screen Implementation Tips
   421	
   422	### 1. LoginScreen
   423	- Use form library (react-hook-form + zod)
   424	- Handle loading + error states
   425	- Persist token to AsyncStorage
   426	- Validate session on app startup
   427	
   428	### 2. Dashboard/Home (OverviewScreen)
   429	- Fetch metrics with `useFocusEffect` to refresh on tab focus
   430	- Use FlatList for recent conversations
   431	- Show connection status indicator
   432	- Display alert badges
   433	
   434	### 3. Conversations Screen
   435	- Implement FlatList with pagination
   436	- On contact selection, navigate to detail modal
   437	- Real-time message updates via WebSocket
   438	- Parse audio attachments and show player
   439	
   440	### 4. Contacts Screen
   441	- Virtual list using FlatList (React Native optimized)
   442	- Inline editing or modal for forms
   443	- Multi-select with checkboxes for batch ops
   444	- Search/filter with debounce
   445	- Save filters to AsyncStorage
   446	
   447	### 5. Pipeline Board (Kanban)
   448	- Challenging: drag-and-drop on mobile
   449	- Use `react-native-draggable-flatlist` or implement custom swipe
   450	- Show columns as ScrollView with nested FlatList
   451	- Modal for contact details
   452	
   453	### 6. Tasks/Handoffs/FAQs/Templates/Tags/Audios
   454	- Standard list screens with pagination
   455	- Modal forms for create/edit
   456	- Swipe-to-delete or delete button
   457	- Search/filter capabilities
   458	
   459	### 7. Create User (Admin)
   460	- Gate with role check
   461	- Form validation with error display
   462	- Success/error feedback via toast
   463	
   464	---
   465	
   466	## 🔐 Secure Storage & State
   467	
   468	### Token Storage
   469	Use `react-native-secure-store` for production:
   470	```bash
   471	npm install react-native-secure-store
   472	```
   473	
   474	Or AsyncStorage for development (less secure):
   475	```typescript
   476	// src/services/storage/tokenStorage.ts
   477	import AsyncStorage from '@react-native-async-storage/async-storage';
   478	
   479	const TOKEN_KEY = 'esports_ia_token';
   480	
   481	export const getStoredToken = async (): Promise<string | null> => {
   482	  return AsyncStorage.getItem(TOKEN_KEY);
   483	};
   484	
   485	export const storeToken = async (token: string): Promise<void> => {
   486	  await AsyncStorage.setItem(TOKEN_KEY, token);
   487	};
   488	
   489	export const clearToken = async (): Promise<void> => {
   490	  await AsyncStorage.removeItem(TOKEN_KEY);
   491	};
   492	```
   493	
   494	### Filter & Cache Storage
   495	```typescript
   496	// src/services/storage/filterStorage.ts
   497	import AsyncStorage from '@react-native-async-storage/async-storage';
   498	
   499	const FILTERS_PREFIX = 'filters:';
   500	
   501	export const getFilters = async (pageKey: string, userId: string): Promise<Record<string, any>> => {
   502	  const key = `${FILTERS_PREFIX}${userId}:${pageKey}`;
   503	  const stored = await AsyncStorage.getItem(key);
   504	  return stored ? JSON.parse(stored) : {};
   505	};
   506	
   507	export const saveFilters = async (pageKey: string, userId: string, filters: Record<string, any>): Promise<void> => {
   508	  const key = `${FILTERS_PREFIX}${userId}:${pageKey}`;
   509	  await AsyncStorage.setItem(key, JSON.stringify(filters));
   510	};
   511	```
   512	
   513	---
   514	
   515	## 🔌 WebSocket Connection Setup
   516	
   517	```typescript
   518	// src/services/websocket/wsClient.ts
   519	import { getStoredToken } from '@/services/storage/tokenStorage';
   520	import { getEnvVariable } from '@/utils/env';
   521	
   522	export interface WsMessage {
   523	  type: string;
   524	  data?: any;
   525	}
   526	
   527	export class WebSocketClient {
   528	  private ws: WebSocket | null = null;
   529	  private url: string;
   530	  private reconnectAttempts = 0;
   531	  private maxReconnectAttempts = 10;
   532	  private reconnectDelay = 2000;
   533	  private listeners: Map<string, Function[]> = new Map();
   534	
   535	  constructor() {
   536	    this.url = getEnvVariable('REACT_APP_WS_BASE');
   537	  }
   538	
   539	  async connect(): Promise<void> {
   540	    const token = await getStoredToken();
   541	    if (!token) return;
   542	
   543	    const wsUrl = `${this.url}?token=${token}`;
   544	    this.ws = new WebSocket(wsUrl);
   545	
   546	    this.ws.onopen = () => {
   547	      console.log('WS connected');
   548	      this.reconnectAttempts = 0;
   549	    };
   550	
   551	    this.ws.onmessage = (event) => {
   552	      const message: WsMessage = JSON.parse(event.data);
   553	      this.emit(message.type, message.data);
   554	    };
   555	
   556	    this.ws.onerror = (error) => {
   557	      console.error('WS error:', error);
   558	    };
   559	
   560	    this.ws.onclose = () => {
   561	      this.attemptReconnect();
   562	    };
   563	  }
   564	
   565	  private attemptReconnect(): void {
   566	    if (this.reconnectAttempts < this.maxReconnectAttempts) {
   567	      this.reconnectAttempts++;
   568	      setTimeout(() => this.connect(), this.reconnectDelay * this.reconnectAttempts);
   569	    }
   570	  }
   571	
   572	  subscribe(event: string, callback: Function): () => void {
   573	    if (!this.listeners.has(event)) {
   574	      this.listeners.set(event, []);
   575	    }
   576	    this.listeners.get(event)!.push(callback);
   577	
   578	    return () => {
   579	      const callbacks = this.listeners.get(event);
   580	      if (callbacks) {
   581	        this.listeners.set(event, callbacks.filter(cb => cb !== callback));
   582	      }
   583	    };
   584	  }
   585	
   586	  private emit(event: string, data: any): void {
   587	    const callbacks = this.listeners.get(event) || [];
   588	    callbacks.forEach(callback => callback(data));
   589	  }
   590	
   591	  send(event: string, data: any): void {
   592	    if (this.ws?.readyState === WebSocket.OPEN) {
   593	      this.ws.send(JSON.stringify({ type: event, data }));
   594	    }
   595	  }
   596	
   597	  disconnect(): void {
   598	    this.ws?.close();
   599	    this.listeners.clear();
   600	  }
   601	}
   602	```
   603	
   604	---
   605	
   606	## 📋 Checklist for Migration
   607	
   608	- [ ] Project structure created
   609	- [ ] Dependencies installed
   610	- [ ] TypeScript configured
   611	- [ ] Environment variables setup
   612	- [ ] API client configured
   613	- [ ] Token storage implemented
   614	- [ ] Auth context + hook created
   615	- [ ] WebSocket client created
   616	- [ ] Toast/notification system
   617	- [ ] Navigation structure
   618	- [ ] LoginScreen implemented
   619	- [ ] DashboardNavigator setup
   620	- [ ] OverviewScreen completed
   621	- [ ] ConversationsScreen completed
   622	- [ ] ContactsScreen completed
   623	- [ ] PipelineBoard completed
   624	- [ ] Handoff/Tasks/FAQs/Templates/Tags/Audios screens
   625	- [ ] CreateUserScreen (admin)
   626	- [ ] Error boundaries + error handling
   627	- [ ] Unit tests
   628	- [ ] Build & deployment config
   629	
   630	---
   631	
   632	## 🧪 Testing Setup
   633	
   634	```bash
   635	npm install --save-dev jest @testing-library/react-native @testing-library/jest-native
   636	```
   637	
   638	Create `jest.config.js`:
   639	```javascript
   640	module.exports = {
   641	  preset: 'react-native',
   642	  setupFilesAfterEnv: ['@testing-library/jest-native/extend-expect'],
   643	  testEnvironment: 'node',
   644	  moduleNameMapper: {
   645	    '^@/(.*)$': '<rootDir>/src/$1',
   646	  },
   647	};
   648	```
   649	
   650	---
   651	
   652	## 🔍 Performance Tips
   653	
   654	1. **Use FlatList** instead of ScrollView for long lists
   655	2. **Memoize components** with React.memo for re-render prevention
   656	3. **Use useMemo/useCallback** for expensive operations
   657	4. **Implement pagination** instead of loading all data
   658	5. **Use error boundaries** to catch crashes
   659	6. **Debounce search/filter** inputs (500ms)
   660	7. **Use react-native-reanimated** for smooth animations
   661	8. **Lazy load images** with Image component optimization
   662	9. **Monitor bundle size** with metro bundler
   663	10. **Profile with React Native Debugger**
   664	