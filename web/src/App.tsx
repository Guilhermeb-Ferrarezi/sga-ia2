import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  LogOut,
  MessageSquareText,
  RefreshCcw,
  ShieldCheck,
  Users,
} from "lucide-react";
import {
  ApiError,
  api,
  sessionStore,
  type AuthUser,
  type DashboardConversation,
  type DashboardOverview,
  type DashboardTurn,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const formatDateTime = (value: string): string =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));

const metricCards: Array<{
  key: keyof DashboardOverview;
  title: string;
  icon: typeof MessageSquareText;
}> = [
  { key: "totalMessages", title: "Mensagens Totais", icon: MessageSquareText },
  { key: "userMessages", title: "Msgs de Clientes", icon: Users },
  { key: "assistantMessages", title: "Msgs da IA", icon: Activity },
  { key: "totalContacts", title: "Contatos Ativos", icon: ShieldCheck },
];

function LoginView(props: {
  onLogin: (email: string, password: string) => Promise<void>;
  loading: boolean;
  error: string | null;
}): JSX.Element {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await props.onLogin(email, password);
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4 py-12">
      <div className="pointer-events-none absolute inset-0 opacity-70 [background:radial-gradient(circle_at_20%_20%,rgba(255,127,17,0.22),transparent_32%),radial-gradient(circle_at_80%_10%,rgba(0,128,128,0.25),transparent_35%),radial-gradient(circle_at_50%_80%,rgba(255,204,128,0.18),transparent_40%)]" />
      <Card className="glass-panel w-full max-w-md animate-fade-up">
        <CardHeader className="space-y-2">
          <Badge variant="secondary" className="w-fit">
            Painel Operacional
          </Badge>
          <CardTitle>Entrar no painel</CardTitle>
          <CardDescription>
            Use o usuario admin do `.env` para acessar conversas e metricas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@local.dev"
                value={email}
                autoComplete="email"
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="********"
                value={password}
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            {props.error ? (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {props.error}
              </p>
            ) : null}
            <Button type="submit" className="w-full" disabled={props.loading}>
              {props.loading ? "Entrando..." : "Entrar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

export default function App(): JSX.Element {
  const [token, setToken] = useState<string | null>(() => sessionStore.get());
  const [user, setUser] = useState<AuthUser | null>(null);
  const [bootLoading, setBootLoading] = useState(true);

  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [conversations, setConversations] = useState<DashboardConversation[]>([]);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [turns, setTurns] = useState<DashboardTurn[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [turnsLoading, setTurnsLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  const selectedConversation = useMemo(
    () => conversations.find((item) => item.phone === selectedPhone) ?? null,
    [conversations, selectedPhone],
  );

  const clearSession = useCallback(() => {
    sessionStore.clear();
    setToken(null);
    setUser(null);
    setOverview(null);
    setConversations([]);
    setTurns([]);
    setSelectedPhone(null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      if (!token) {
        setBootLoading(false);
        return;
      }

      try {
        const me = await api.me(token);
        if (cancelled) return;
        setUser(me.user);
      } catch {
        if (cancelled) return;
        clearSession();
      } finally {
        if (!cancelled) {
          setBootLoading(false);
        }
      }
    };

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [token, clearSession]);

  const handleLogin = async (email: string, password: string): Promise<void> => {
    setAuthLoading(true);
    setAuthError(null);

    try {
      const session = await api.login(email, password);
      sessionStore.set(session.token);
      setToken(session.token);
      setUser(session.user);
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : "Nao foi possivel autenticar";
      setAuthError(message);
    } finally {
      setAuthLoading(false);
    }
  };

  const loadDashboard = useCallback(async () => {
    if (!token) return;

    setDashboardLoading(true);
    setDashboardError(null);

    try {
      const [overviewResult, conversationsResult] = await Promise.all([
        api.overview(token),
        api.conversations(token, 60),
      ]);

      setOverview(overviewResult);
      setConversations(conversationsResult);
      setSelectedPhone((current) => current ?? conversationsResult[0]?.phone ?? null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearSession();
        return;
      }
      setDashboardError(
        error instanceof ApiError ? error.message : "Falha ao carregar dashboard",
      );
    } finally {
      setDashboardLoading(false);
    }
  }, [token, clearSession]);

  useEffect(() => {
    if (!token || !user) return;
    void loadDashboard();
  }, [token, user, loadDashboard]);

  useEffect(() => {
    let cancelled = false;

    const loadTurns = async () => {
      if (!token || !selectedPhone) {
        setTurns([]);
        return;
      }

      setTurnsLoading(true);
      try {
        const conversationTurns = await api.conversationTurns(token, selectedPhone, 500);
        if (cancelled) return;
        setTurns(conversationTurns);
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 401) {
          clearSession();
          return;
        }
        setDashboardError(
          error instanceof ApiError
            ? error.message
            : "Falha ao carregar as mensagens da conversa",
        );
      } finally {
        if (!cancelled) {
          setTurnsLoading(false);
        }
      }
    };

    void loadTurns();
    return () => {
      cancelled = true;
    };
  }, [token, selectedPhone, clearSession]);

  if (bootLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-sm animate-fade-up">
          <CardHeader>
            <CardTitle>Carregando sessao</CardTitle>
            <CardDescription>Validando acesso ao painel SG Esports IA.</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  if (!user || !token) {
    return <LoginView onLogin={handleLogin} loading={authLoading} error={authError} />;
  }

  return (
    <main className="container min-h-screen py-6">
      <section className="stagger grid gap-6">
        <Card className="glass-panel animate-fade-up">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                SG Esports IA
              </p>
              <h1 className="text-2xl font-bold leading-tight">Central de Conversas</h1>
            </div>
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10 border border-border">
                <AvatarFallback className="bg-primary text-primary-foreground">
                  {user.email.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="text-right">
                <p className="text-sm font-medium">{user.email}</p>
                <p className="text-xs text-muted-foreground">{user.role}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="ml-2"
                onClick={clearSession}
              >
                <LogOut className="h-4 w-4" />
                Sair
              </Button>
            </div>
          </CardContent>
        </Card>

        {dashboardError ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {dashboardError}
          </p>
        ) : null}

        <Tabs defaultValue="overview" className="animate-fade-up">
          <div className="flex items-center justify-between gap-3">
            <TabsList>
              <TabsTrigger value="overview">Visao Geral</TabsTrigger>
              <TabsTrigger value="conversations">Conversas</TabsTrigger>
            </TabsList>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void loadDashboard()}
              disabled={dashboardLoading}
            >
              <RefreshCcw className={cn("h-4 w-4", dashboardLoading && "animate-spin")} />
              Atualizar
            </Button>
          </div>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {metricCards.map(({ key, title, icon: Icon }, index) => (
                <Card
                  key={key}
                  className="animate-fade-up"
                  style={{ animationDelay: `${index * 80}ms` }}
                >
                  <CardHeader className="pb-2">
                    <CardDescription>{title}</CardDescription>
                    <CardTitle className="flex items-center justify-between">
                      <span className="text-3xl font-bold">
                        {overview ? overview[key] : "--"}
                      </span>
                      <Icon className="h-5 w-5 text-primary" />
                    </CardTitle>
                  </CardHeader>
                </Card>
              ))}
            </div>
            <Card className="animate-fade-up" style={{ animationDelay: "220ms" }}>
              <CardHeader>
                <CardTitle>Operacao</CardTitle>
                <CardDescription>
                  O painel usa autenticação JWT e dados persistidos no PostgreSQL.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Backend ativo em `API_BASE_PATH={import.meta.env.VITE_API_BASE ?? "/api"}`.
                  Se nao aparecer conversa, valide `ENABLE_DB=true` e rode as migracoes.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="conversations">
            <div className="grid gap-4 lg:grid-cols-12">
              <Card className="lg:col-span-4">
                <CardHeader className="pb-3">
                  <CardTitle>Contatos</CardTitle>
                  <CardDescription>
                    {conversations.length} conversa(s) registradas no banco.
                  </CardDescription>
                </CardHeader>
                <Separator />
                <CardContent className="p-0">
                  <ScrollArea className="h-[520px]">
                    <div className="space-y-2 p-3">
                      {conversations.map((conversation) => (
                        <button
                          key={conversation.phone}
                          type="button"
                          onClick={() => setSelectedPhone(conversation.phone)}
                          className={cn(
                            "w-full rounded-lg border px-3 py-2 text-left transition",
                            selectedPhone === conversation.phone
                              ? "border-primary bg-primary/10"
                              : "border-border bg-background/50 hover:bg-muted/70",
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate font-medium">{conversation.phone}</p>
                            <Badge variant="secondary">{conversation.messagesCount}</Badge>
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {conversation.lastMessagePreview}
                          </p>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {formatDateTime(conversation.lastMessageAt)}
                          </p>
                        </button>
                      ))}
                      {!conversations.length ? (
                        <p className="px-1 py-4 text-sm text-muted-foreground">
                          Nenhuma conversa registrada ainda.
                        </p>
                      ) : null}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              <Card className="lg:col-span-8">
                <CardHeader className="pb-3">
                  <CardTitle>Timeline</CardTitle>
                  <CardDescription>
                    {selectedConversation
                      ? `Conversa com ${selectedConversation.phone}`
                      : "Selecione um contato para ver as mensagens"}
                  </CardDescription>
                </CardHeader>
                <Separator />
                <CardContent className="p-0">
                  <ScrollArea className="h-[520px]">
                    <div className="space-y-3 p-4">
                      {turnsLoading ? (
                        <p className="text-sm text-muted-foreground">Carregando mensagens...</p>
                      ) : null}

                      {!turnsLoading && !turns.length ? (
                        <p className="text-sm text-muted-foreground">
                          Sem mensagens para este contato.
                        </p>
                      ) : null}

                      {turns.map((turn) => (
                        <div
                          key={turn.id}
                          className={cn(
                            "max-w-[85%] rounded-xl px-4 py-3 shadow",
                            turn.role === "assistant"
                              ? "ml-auto bg-primary text-primary-foreground"
                              : "bg-secondary text-secondary-foreground",
                          )}
                        >
                          <p className="whitespace-pre-wrap text-sm">{turn.content}</p>
                          <p
                            className={cn(
                              "mt-2 text-[11px]",
                              turn.role === "assistant"
                                ? "text-primary-foreground/80"
                                : "text-secondary-foreground/70",
                            )}
                          >
                            {turn.role} • {formatDateTime(turn.createdAt)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </section>
    </main>
  );
}
