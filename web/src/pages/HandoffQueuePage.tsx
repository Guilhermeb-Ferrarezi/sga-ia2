import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRightCircle,
  Info,
  MessageCircle,
  RefreshCcw,
  UserCheck,
  UserMinus,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { useOperationalAlerts } from "@/contexts/OperationalAlertsContext";
import { useWebSocket } from "@/contexts/WebSocketContext";
import { api, type HandoffQueueItem } from "@/lib/api";
import { getMessagePreviewText } from "@/lib/messageContent";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const formatDate = (value: string | null): string => {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
};

const formatWait = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const remain = minutes % 60;
  if (hours <= 0) return `${remain} min`;
  return `${hours}h ${remain}m`;
};

const slaBadgeClass: Record<string, string> = {
  ok: "border-emerald-500/50 bg-emerald-500/10 text-emerald-200",
  warning: "border-amber-500/50 bg-amber-500/10 text-amber-200",
  critical: "border-rose-500/50 bg-rose-500/10 text-rose-200",
};

const slaLabel: Record<string, string> = {
  ok: "SLA ok",
  warning: "SLA atencao",
  critical: "SLA critico",
};

const handoffStatusLabel: Record<string, string> = {
  QUEUED: "Na fila",
  ASSIGNED: "Atribuido",
  IN_PROGRESS: "Em atendimento",
  RESOLVED: "Resolvido",
  NONE: "Sem handoff",
};

export default function HandoffQueuePage() {
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const { toast } = useToast();
  const { subscribeFiltered } = useWebSocket();
  const { refresh: refreshAlerts } = useOperationalAlerts();
  const [items, setItems] = useState<HandoffQueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [updatingWaId, setUpdatingWaId] = useState<string | null>(null);
  const [onlyMine, setOnlyMine] = useState(false);
  const canAssignHandoffs = hasPermission(user, PERMISSIONS.HANDOFF_ASSIGN);
  const canManageHandoffContacts = hasPermission(user, PERMISSIONS.CONTACTS_MANAGE_HANDOFF);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await api.handoffQueue(token, { onlyMine });
      setItems(data);
    } catch (err: unknown) {
      toast({
        title: "Falha ao carregar fila",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [token, onlyMine, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return subscribeFiltered(
      () => { void load(); },
      { types: ["contact:updated", "contact:deleted", "handoff:updated", "task:updated"] },
    );
  }, [subscribeFiltered, load]);

  const assume = async (item: HandoffQueueItem) => {
    if (!token || !user || !canAssignHandoffs) return;
    setUpdatingWaId(item.waId);
    try {
      await api.assignHandoff(token, item.waId, user.email);
      toast({ title: "Atendimento assumido", variant: "success" });
      await Promise.all([load(), refreshAlerts()]);
    } catch (err: unknown) {
      toast({
        title: "Falha ao assumir atendimento",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "error",
      });
    } finally {
      setUpdatingWaId(null);
    }
  };

  const release = async (item: HandoffQueueItem) => {
    if (!token || !canAssignHandoffs) return;
    setUpdatingWaId(item.waId);
    try {
      await api.assignHandoff(token, item.waId, null);
      toast({ title: "Atendimento liberado", variant: "success" });
      await Promise.all([load(), refreshAlerts()]);
    } catch (err: unknown) {
      toast({
        title: "Falha ao liberar atendimento",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "error",
      });
    } finally {
      setUpdatingWaId(null);
    }
  };

  const resumeBot = async (item: HandoffQueueItem) => {
    if (!token || !canManageHandoffContacts) return;
    setUpdatingWaId(item.waId);
    try {
      await api.updateContact(token, item.waId, {
        handoffRequested: false,
        handoffReason: null,
        handoffAt: null,
        botEnabled: true,
      });
      toast({ title: "Bot retomado para o contato", variant: "success" });
      await Promise.all([load(), refreshAlerts()]);
    } catch (err: unknown) {
      toast({
        title: "Falha ao retomar bot",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "error",
      });
    } finally {
      setUpdatingWaId(null);
    }
  };

  const summary = useMemo(
    () => ({
      total: items.length,
      critical: items.filter((item) => item.slaLevel === "critical").length,
      warning: items.filter((item) => item.slaLevel === "warning").length,
      assigned: items.filter((item) => Boolean(item.assignedTo)).length,
    }),
    [items],
  );

  return (
    <motion.div className="space-y-5" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: "easeOut" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold">Fila de Handoff Humano</h2>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={onlyMine}
              onChange={(event) => setOnlyMine(event.target.checked)}
            />
            Mostrar so meus atendimentos
          </label>
          <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCcw className={cn("h-4 w-4", loading && "animate-spin")} />
            Atualizar
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-border/70">
          <CardContent className="p-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Total</p>
            <p className="mt-1 text-2xl font-bold">{summary.total}</p>
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardContent className="p-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Criticos</p>
            <p className="mt-1 text-2xl font-bold text-rose-300">{summary.critical}</p>
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardContent className="p-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Em atencao</p>
            <p className="mt-1 text-2xl font-bold text-amber-300">{summary.warning}</p>
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardContent className="p-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Atribuidos</p>
            <p className="mt-1 text-2xl font-bold text-cyan-300">{summary.assigned}</p>
          </CardContent>
        </Card>
      </div>

      {!canAssignHandoffs && !canManageHandoffContacts && (
        <p className="text-sm text-muted-foreground">
          Seu cargo pode acompanhar a fila, mas nao assumir, liberar nem retomar o bot.
        </p>
      )}

      <div className="space-y-3">
        {loading && !items.length && (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border/60 bg-card/50 p-4 space-y-2 animate-pulse">
                <div className="flex items-center justify-between">
                  <div className="h-4 w-1/3 rounded-md bg-muted/60" />
                  <div className="h-5 w-20 rounded-full bg-muted/60" />
                </div>
                <div className="h-3 w-2/3 rounded-md bg-muted/60" />
                <div className="h-3 w-1/2 rounded-md bg-muted/60" />
              </div>
            ))}
          </div>
        )}
        {!loading && !items.length && (
          <p className="text-sm text-muted-foreground">
            Nenhum contato aguardando atendimento humano.
          </p>
        )}
        {items.map((item) => {
          const isUpdating = updatingWaId === item.waId;
          return (
            <Card key={item.waId} className="border-border/70">
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{item.name || item.waId}</CardTitle>
                    <p className="text-xs text-muted-foreground">{item.waId}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge
                      variant="outline"
                      className={cn("h-5 px-2 text-[10px]", slaBadgeClass[item.slaLevel])}
                      title="SLA de atendimento humano"
                    >
                      <Info className="mr-1 h-3 w-3" />
                      {slaLabel[item.slaLevel]}
                    </Badge>
                    <Badge variant="outline" className="h-5 px-2 text-[10px]">
                      {formatWait(item.waitMinutes)}
                    </Badge>
                    {item.stage && (
                      <Badge variant="outline" className="h-5 px-2 text-[10px]">
                        {item.stage.name}
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                <p className="text-sm text-foreground/90">
                  <span className="text-muted-foreground">Motivo: </span>
                  {item.handoffReason || "Nao informado"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Solicitado em: {formatDate(item.handoffAt)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Atribuido para: {item.assignedTo || "Nao atribuido"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Status: {handoffStatusLabel[item.handoffStatus] || item.handoffStatus}
                </p>
                {item.firstHumanReplyAt && (
                  <p className="text-xs text-muted-foreground">
                    Primeiro retorno humano: {formatDate(item.firstHumanReplyAt)}
                  </p>
                )}
                {item.aiSummary && (
                  <div className="rounded-md border border-border/60 bg-background/50 px-2 py-2">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                      Resumo para o atendente
                    </p>
                    <p className="mt-1 text-sm text-foreground/90">{item.aiSummary}</p>
                  </div>
                )}
                {item.triageMissing.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                      Triagem pendente
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {item.triageMissing.map((field) => (
                        <Badge key={field} variant="outline" className="h-5 px-2 text-[10px]">
                          {field}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {(item.triageSnapshot.tournament ||
                  item.triageSnapshot.eventDate ||
                  item.triageSnapshot.category ||
                  item.triageSnapshot.city ||
                  item.triageSnapshot.teamName ||
                  item.triageSnapshot.playersCount ||
                  item.triageSnapshot.email) && (
                  <div className="rounded-md border border-border/60 bg-background/50 px-2 py-2 text-xs text-muted-foreground">
                    {[item.triageSnapshot.tournament, item.triageSnapshot.eventDate, item.triageSnapshot.category, item.triageSnapshot.city, item.triageSnapshot.teamName, item.triageSnapshot.playersCount ? `${item.triageSnapshot.playersCount} jogadores` : null, item.triageSnapshot.email]
                      .filter(Boolean)
                      .join(" • ")}
                  </div>
                )}
                {item.latestMessage && (
                  <p className="rounded-md border border-border/60 bg-background/50 px-2 py-1 text-sm text-foreground/90">
                    <span className="text-xs text-muted-foreground">
                      {item.latestMessage.source === "AGENT"
                        ? item.latestMessage.sentByUser?.name || item.latestMessage.sentByUser?.email || "Equipe"
                        : item.latestMessage.source === "SYSTEM"
                          ? "Equipe"
                          : item.latestMessage.source === "AI"
                            ? "Assistente"
                            : item.latestMessage.direction === "out"
                              ? "Equipe"
                              : "Cliente"}
                      :{" "}
                    </span>
                    "{getMessagePreviewText(item.latestMessage.body)}"
                  </p>
                )}
                {item.openTasks.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                      Tarefas abertas
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {item.openTasks.map((task) => (
                        <Badge key={task.id} variant="outline" className="h-5 px-2 text-[10px]">
                          {task.title}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap justify-end gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      navigate(
                        `/dashboard/conversations?phone=${encodeURIComponent(item.waId)}`,
                      )
                    }
                  >
                    <MessageCircle className="h-4 w-4" />
                    Abrir chat
                  </Button>
                  {!item.assignedTo || item.assignedTo !== user?.email ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void assume(item)}
                      disabled={isUpdating || !canAssignHandoffs}
                    >
                      <UserCheck className="h-4 w-4" />
                      Assumir
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void release(item)}
                      disabled={isUpdating || !canAssignHandoffs}
                    >
                      <UserMinus className="h-4 w-4" />
                      Liberar
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={() => void resumeBot(item)}
                    disabled={isUpdating || !canManageHandoffContacts}
                  >
                    <ArrowRightCircle className="h-4 w-4" />
                    Retomar bot
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </motion.div>
  );
}
