import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  Bot,
  BotOff,
  CheckCircle2,
  Clock3,
  AlertTriangle,
  CircleDashed,
  ListTodo,
  MessageSquareText,
  RefreshCcw,
  ShieldCheck,
  Timer,
  Users,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useWebSocket, type WsEventPayload } from "@/contexts/WebSocketContext";
import {
  api,
  type DashboardConversation,
  type DashboardOverview,
  type FunnelStageMetric,
  type OperationalAlertsSummary,
  type PipelineBoard,
  type Task,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import MetricCard from "@/components/dashboard/MetricCard";

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

export default function OverviewTab() {
  const { token, logout } = useAuth();
  const { subscribe, subscribeFiltered } = useWebSocket();
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [alerts, setAlerts] = useState<OperationalAlertsSummary | null>(null);
  const [recentConversations, setRecentConversations] = useState<DashboardConversation[]>([]);
  const [board, setBoard] = useState<PipelineBoard | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [funnel, setFunnel] = useState<FunnelStageMetric[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatDate = (value: string | null): string => {
    if (!value) return "-";
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  };

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [overviewData, alertsData, conversationData, boardData, taskData, funnelData] = await Promise.all([
        api.overview(token),
        api.alertsSummary(token),
        api.conversations(token, 6),
        api.pipelineBoard(token, { limit: 100 }),
        api.tasks(token),
        api.funnelMetrics(token),
      ]);
      setOverview(overviewData);
      setAlerts(alertsData);
      setRecentConversations(conversationData);
      setBoard(boardData);
      setTasks(taskData);
      setFunnel(funnelData);
    } catch (err: unknown) {
      if (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 401) {
        logout();
        return;
      }
      setError(err instanceof Error ? err.message : "Falha ao carregar");
    } finally {
      setLoading(false);
    }
  }, [token, logout]);

  useEffect(() => {
    void load();
  }, [load]);

  // Listen for real-time overview updates
  useEffect(() => {
    return subscribeFiltered(
      (event: WsEventPayload) => {
        if (event.type === "overview:updated") {
          setOverview(event.payload as unknown as DashboardOverview);
          return;
        }
        void load();
      },
      {
        types: [
          "overview:updated",
          "contact:updated",
          "contact:deleted",
          "handoff:updated",
          "task:updated",
          "pipeline:updated",
        ],
      },
    );
  }, [subscribeFiltered, load]);

  const pipelineContacts = board
    ? [...board.unassigned.items, ...board.stages.flatMap((stage) => stage.items)]
    : [];

  const leadStatusSummary = pipelineContacts.reduce(
    (acc, contact) => {
      if (contact.leadStatus === "won") acc.won += 1;
      else if (contact.leadStatus === "lost") acc.lost += 1;
      else acc.open += 1;
      if (contact.handoffRequested) acc.handoff += 1;
      if (contact.botEnabled) acc.botOn += 1;
      else acc.botOff += 1;
      return acc;
    },
    { open: 0, won: 0, lost: 0, handoff: 0, botOn: 0, botOff: 0 },
  );

  const tasksSummary = tasks.reduce(
    (acc, task) => {
      if (task.status === "done") acc.done += 1;
      else if (task.status === "in_progress") acc.inProgress += 1;
      else if (task.status === "cancelled") acc.cancelled += 1;
      else acc.open += 1;

      if (task.priority === "urgent") acc.urgent += 1;
      return acc;
    },
    { open: 0, inProgress: 0, done: 0, cancelled: 0, urgent: 0 },
  );

  return (
    <motion.div className="space-y-5" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: "easeOut" }}>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Visao Geral</h2>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCcw className={cn("h-4 w-4", loading && "animate-spin")} />
          Atualizar
        </Button>
      </div>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading && !overview
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border/60 bg-card/50 p-4 space-y-2 animate-pulse">
                <div className="h-3 w-20 rounded-md bg-muted/60" />
                <div className="h-8 w-16 rounded-md bg-muted/60" />
                <div className="h-3 w-24 rounded-md bg-muted/60" />
              </div>
            ))
          : metricCards.map(({ key, title, icon: Icon }, index) => (
              <MetricCard
                key={key}
                title={title}
                value={overview ? overview[key] : "--"}
                icon={<Icon className="h-5 w-5 text-primary" />}
                delay={index * 80}
              />
            ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="animate-fade-up border-border/70" style={{ animationDelay: "180ms" }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Alertas Operacionais</CardTitle>
            <CardDescription>
              Estado atual de SLAs e tarefas fora do prazo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between rounded-md border border-border/70 px-3 py-2">
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock3 className="h-4 w-4 text-amber-300" />
                Tarefas vencidas
              </span>
              <span className="font-semibold">{alerts?.overdueTasks ?? "--"}</span>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border/70 px-3 py-2">
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Timer className="h-4 w-4 text-cyan-300" />
                Handoff pendente
              </span>
              <span className="font-semibold">{alerts?.pendingHandoffs ?? "--"}</span>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border/70 px-3 py-2">
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <AlertTriangle className="h-4 w-4 text-rose-300" />
                Handoff critico
              </span>
              <span className="font-semibold">{alerts?.criticalHandoffs ?? "--"}</span>
            </div>
            <p className="pt-1 text-xs text-muted-foreground">
              Ultima atualizacao: {formatDate(alerts?.updatedAt ?? null)}
            </p>
          </CardContent>
        </Card>

        <Card className="animate-fade-up border-border/70" style={{ animationDelay: "220ms" }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Pipeline Snapshot</CardTitle>
            <CardDescription>
              Visao de status, bot e distribuicao de leads.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-md border border-cyan-500/30 bg-cyan-500/5 px-2 py-2">
                <p className="text-[11px] text-muted-foreground">Abertos</p>
                <p className="text-lg font-semibold text-cyan-200">{leadStatusSummary.open}</p>
              </div>
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2 py-2">
                <p className="text-[11px] text-muted-foreground">Ganhos</p>
                <p className="text-lg font-semibold text-emerald-200">{leadStatusSummary.won}</p>
              </div>
              <div className="rounded-md border border-rose-500/30 bg-rose-500/5 px-2 py-2">
                <p className="text-[11px] text-muted-foreground">Perdidos</p>
                <p className="text-lg font-semibold text-rose-200">{leadStatusSummary.lost}</p>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border/70 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Sem estagio</span>
              <span className="font-semibold">{board?.unassigned.total ?? 0}</span>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border/70 px-3 py-2 text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Bot className="h-4 w-4 text-emerald-300" />
                Bot ativo
              </span>
              <span className="font-semibold">{leadStatusSummary.botOn}</span>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border/70 px-3 py-2 text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                <BotOff className="h-4 w-4 text-amber-300" />
                Bot desativado
              </span>
              <span className="font-semibold">{leadStatusSummary.botOff}</span>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border/70 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Aguardando humano</span>
              <span className="font-semibold">{leadStatusSummary.handoff}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="animate-fade-up border-border/70" style={{ animationDelay: "260ms" }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Tarefas</CardTitle>
            <CardDescription>
              Resumo rapido do backlog operacional.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between rounded-md border border-border/70 px-3 py-2 text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                <CircleDashed className="h-4 w-4 text-cyan-300" />
                Abertas
              </span>
              <span className="font-semibold">{tasksSummary.open}</span>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border/70 px-3 py-2 text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                <ListTodo className="h-4 w-4 text-amber-300" />
                Em andamento
              </span>
              <span className="font-semibold">{tasksSummary.inProgress}</span>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border/70 px-3 py-2 text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                Concluidas
              </span>
              <span className="font-semibold">{tasksSummary.done}</span>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border/70 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Canceladas</span>
              <span className="font-semibold">{tasksSummary.cancelled}</span>
            </div>
            <div className="flex items-center justify-between rounded-md border border-rose-500/35 bg-rose-500/5 px-3 py-2 text-sm">
              <span className="text-rose-200">Urgentes</span>
              <span className="font-semibold text-rose-200">{tasksSummary.urgent}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Funnel Metrics ──────────────────────────────────── */}
      {funnel.length > 0 && (
        <Card className="animate-fade-up border-border/70" style={{ animationDelay: "280ms" }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Métricas de Funil</CardTitle>
            <CardDescription>Conversão e tempo médio por etapa do pipeline.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {funnel.map((stage) => (
                <div
                  key={stage.stageId}
                  className="rounded-lg border border-border/60 p-3 space-y-1"
                >
                  <p className="text-sm font-medium truncate">{stage.stageName}</p>
                  <div className="flex items-end justify-between gap-2">
                    <div>
                      <p className="text-2xl font-bold">{stage.total}</p>
                      <p className="text-[11px] text-muted-foreground">leads</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold text-emerald-400">{stage.conversionRate}%</p>
                      <p className="text-[11px] text-muted-foreground">conversão</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/40">
                    <span>Ganhos: {stage.won} | Perdidos: {stage.lost}</span>
                    <span>
                      {stage.avgHoursInStage != null
                        ? stage.avgHoursInStage < 24
                          ? `${stage.avgHoursInStage}h`
                          : `${Math.round(stage.avgHoursInStage / 24)}d`
                        : "—"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="animate-fade-up border-border/70" style={{ animationDelay: "300ms" }}>
        <CardHeader>
          <CardTitle>Conversas Recentes</CardTitle>
          <CardDescription>
            Ultimas interacoes para acompanhamento rapido.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {!recentConversations.length && (
            <p className="text-sm text-muted-foreground">Nenhuma conversa encontrada.</p>
          )}

          {recentConversations.map((conversation) => (
            <div
              key={conversation.phone}
              className="rounded-md border border-border/70 px-3 py-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {conversation.name || conversation.phone}
                </p>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="h-5 px-2 text-[11px]">
                    {conversation.messagesCount} msg(s)
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(conversation.lastMessageAt)}
                  </span>
                </div>
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {conversation.lastMessagePreview}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </motion.div>
  );
}
