import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, BotOff, Loader2, Send } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useWebSocket, type WsEventPayload } from "@/contexts/WebSocketContext";
import { api, type DashboardTurn } from "@/lib/api";
import {
  parseAudioMessageContent,
  parseImageMessageContent,
} from "@/lib/messageContent";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import LoadingScreen from "@/components/ui/loading-screen";
import { AudioPlayer } from "@/components/ui/audio-player";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import {
  LeadOriginBadge,
} from "@/components/dashboard/LeadOriginBadge";

const TURNS_PAGE_SIZE = 40;

const formatDateTime = (value: string): string =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));

const formatConversationHeading = (
  phone: string,
  contactName?: string | null,
): string => {
  const normalizedName = contactName?.trim();
  if (!normalizedName) return phone;

  const normalizedPhone = phone.trim();
  const isInstagramPhone = normalizedPhone.startsWith("ig:");
  if (!isInstagramPhone) {
    return normalizedName === normalizedPhone
      ? normalizedName
      : `${normalizedName} (${normalizedPhone})`;
  }

  const instagramId = normalizedPhone.slice(3).trim();
  const normalizedNameWithoutAt = normalizedName.replace(/^@/, "").trim();
  if (instagramId && normalizedNameWithoutAt === instagramId) {
    return normalizedName.startsWith("@") ? normalizedName : `@${normalizedName}`;
  }

  return normalizedName;
};

const getTurnLabel = (turn: DashboardTurn): string => {
  if (turn.source === "AGENT") return turn.sentBy?.name || turn.sentBy?.email || "Equipe";
  if (turn.source === "SYSTEM") return "Equipe";
  if (turn.source === "AI") return "Assistente";
  return turn.role === "assistant" ? "Assistente" : "Cliente";
};

const mergeTurns = (...groups: DashboardTurn[][]): DashboardTurn[] => {
  const byId = new Map<string, DashboardTurn>();
  for (const group of groups) {
    for (const turn of group) {
      byId.set(turn.id, turn);
    }
  }
  return [...byId.values()].sort(
    (left, right) =>
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );
};

interface ConversationDetailProps {
  phone: string;
  contactName?: string | null;
  botEnabled?: boolean;
}

export default function ConversationDetail({
  phone,
  contactName,
  botEnabled: initialBotEnabled,
}: ConversationDetailProps) {
  const { token, logout } = useAuth();
  const { subscribeFiltered } = useWebSocket();
  const [turns, setTurns] = useState<DashboardTurn[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [aiProcessing, setAiProcessing] = useState(false);
  const [botEnabled, setBotEnabled] = useState(initialBotEnabled ?? true);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [totalTurns, setTotalTurns] = useState(0);
  const [hasMoreTurns, setHasMoreTurns] = useState(true);
  const [loadedTurnsCount, setLoadedTurnsCount] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const turnsRef = useRef<DashboardTurn[]>([]);
  const loadedTurnsCountRef = useRef(0);
  
  const { playingId: playingTurnId, duration, currentTime, isPlaying, togglePlay, stopAudio, seek } = useAudioPlayer({ token });

  const scrollToBottom = () => {
    setTimeout(() => {
      scrollRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  };

  useEffect(() => {
    turnsRef.current = turns;
  }, [turns]);

  useEffect(() => {
    loadedTurnsCountRef.current = loadedTurnsCount;
  }, [loadedTurnsCount]);

  const loadInitialTurns = useCallback(async (
    opts?: { showLoading?: boolean; scrollToEnd?: boolean },
  ) => {
    if (!token || !phone) return;
    const showLoading = opts?.showLoading ?? false;
    const scrollToEndAfterLoad = opts?.scrollToEnd ?? false;

    if (showLoading) setLoading(true);
    try {
      const data = await api.conversationTurns(token, phone, { limit: TURNS_PAGE_SIZE, offset: 0 });
      turnsRef.current = data.items;
      loadedTurnsCountRef.current = data.items.length;
      setTurns(data.items);
      setLoadedTurnsCount(data.items.length);
      setTotalTurns(data.total);
      setHasMoreTurns(data.hasMore);

      if (scrollToEndAfterLoad) {
        scrollToBottom();
      }
    } catch (err: unknown) {
      if (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 401) {
        logout();
      }
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [token, phone, logout]);

  const refreshLatestTurns = useCallback(async (opts?: { scrollToEnd?: boolean }) => {
    if (!token || !phone) return;
    try {
      const data = await api.conversationTurns(token, phone, {
        limit: TURNS_PAGE_SIZE,
        offset: 0,
      });
      const nextTurns = mergeTurns(turnsRef.current, data.items);
      turnsRef.current = nextTurns;
      loadedTurnsCountRef.current = nextTurns.length;
      setTurns(nextTurns);
      setLoadedTurnsCount(nextTurns.length);
      setTotalTurns(data.total);
      setHasMoreTurns(nextTurns.length < data.total);
      if (opts?.scrollToEnd) {
        scrollToBottom();
      }
    } catch (err: unknown) {
      if (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 401) {
        logout();
      }
    }
  }, [token, phone, logout]);

  const loadOlderTurns = useCallback(async () => {
    if (!token || !phone || loadingMore || !hasMoreTurns) return;

    const container = listRef.current;
    const previousScrollHeight = container?.scrollHeight ?? 0;
    const previousScrollTop = container?.scrollTop ?? 0;

    setLoadingMore(true);
    try {
      const data = await api.conversationTurns(token, phone, {
        limit: TURNS_PAGE_SIZE,
        offset: loadedTurnsCountRef.current,
      });
      const nextTurns = mergeTurns(data.items, turnsRef.current);
      turnsRef.current = nextTurns;
      loadedTurnsCountRef.current = nextTurns.length;
      setTurns(nextTurns);
      setLoadedTurnsCount(nextTurns.length);
      setTotalTurns(data.total);
      setHasMoreTurns(nextTurns.length < data.total);
      setTimeout(() => {
        const current = listRef.current;
        if (!current) return;
        const currentScrollHeight = current.scrollHeight;
        const delta = currentScrollHeight - previousScrollHeight;
        current.scrollTop = Math.max(0, previousScrollTop + delta);
      }, 0);
    } catch (err: unknown) {
      if (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 401) {
        logout();
      }
    } finally {
      setLoadingMore(false);
    }
  }, [token, phone, loadingMore, hasMoreTurns, logout]);

  useEffect(() => {
    turnsRef.current = [];
    loadedTurnsCountRef.current = 0;
    setTurns([]);
    setLoadedTurnsCount(0);
    setTotalTurns(0);
    setHasMoreTurns(true);
    void loadInitialTurns({ showLoading: true, scrollToEnd: true });
  }, [phone, loadInitialTurns]);

  const scheduleTurnsRefresh = useCallback((opts?: { scrollToEnd?: boolean }) => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = setTimeout(() => {
      void refreshLatestTurns(opts);
    }, 220);
  }, [refreshLatestTurns]);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
      stopAudio();
    };
  }, [stopAudio]);

  // Real-time message updates
  useEffect(() => {
    return subscribeFiltered(
      (event: WsEventPayload) => {
        if (event.type === "message:new" || event.type === "message:sent") {
          scheduleTurnsRefresh({ scrollToEnd: true });
        }
        if (event.type === "ai:processing") {
          setAiProcessing(true);
        }
        if (event.type === "ai:done") {
          setAiProcessing(false);
          scheduleTurnsRefresh({ scrollToEnd: true });
        }
      },
      { types: ["message:new", "message:sent", "ai:processing", "ai:done"], waId: phone },
    );
  }, [subscribeFiltered, phone, refreshLatestTurns, scheduleTurnsRefresh]);

  const toggleBot = async () => {
    if (!token) return;
    const newValue = !botEnabled;
    try {
      await api.toggleBot(token, phone, newValue);
      setBotEnabled(newValue);
    } catch {
      /* ignore */
    }
  };

  const sendMessage = async () => {
    if (!token || !messageText.trim()) return;
    setSending(true);
    try {
      await api.sendMessage(token, phone, messageText.trim());
      setMessageText("");
    } catch {
      /* ignore */
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden lg:col-span-8">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              Conversa com {formatConversationHeading(phone, contactName)}
              {aiProcessing && (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              )}
            </CardTitle>
            <CardDescription>
              {loadedTurnsCount} de {totalTurns} mensagem(ns) carregada(s)
            </CardDescription>
            <LeadOriginBadge waId={phone} showHint className="pt-2" />
          </div>
          <Button
            variant={botEnabled ? "secondary" : "destructive"}
            size="sm"
            onClick={toggleBot}
            title={botEnabled ? "Desativar bot" : "Reativar bot"}
          >
            {botEnabled ? (
              <>
                <Bot className="h-4 w-4 mr-1" /> Bot ON
              </>
            ) : (
              <>
                <BotOff className="h-4 w-4 mr-1" /> Bot OFF
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <Separator />
      <CardContent className="min-h-0 flex-1 p-0">
        <div
          ref={listRef}
          className="h-full overflow-y-scroll pr-1"
        >
          <div className="space-y-3 p-4">
            {loading ? (
              <LoadingScreen
                variant="content"
                className="min-h-[360px] px-2 py-6"
                title="Carregando chat"
                description="Buscando mensagens desta conversa."
              />
            ) : null}
            {!loading && hasMoreTurns && (
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void loadOlderTurns()}
                  disabled={loadingMore}
                >
                  {loadingMore ? (
                    <>
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      Carregando...
                    </>
                  ) : (
                    `Carregar ${TURNS_PAGE_SIZE} mensagens anteriores`
                  )}
                </Button>
              </div>
            )}
            {!loading && !hasMoreTurns && totalTurns > TURNS_PAGE_SIZE && (
              <p className="text-center text-xs text-muted-foreground">
                Historico completo carregado.
              </p>
            )}
            {!loading && !turns.length && (
              <p className="text-sm text-muted-foreground">
                Sem mensagens para este contato.
              </p>
            )}
            {!loading && turns.map((turn) => {
              const audio = parseAudioMessageContent(turn.content);
              const image = parseImageMessageContent(turn.content);
              return (
                <div
                  key={turn.id}
                  className={cn(
                    "max-w-[85%] rounded-xl px-4 py-3 shadow",
                    turn.role === "assistant"
                      ? "ml-auto bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground",
                  )}
                >
                  {audio ? (
                    <div className="space-y-2 w-full">
                      <AudioPlayer
                        isPlaying={playingTurnId === turn.id && isPlaying}
                        currentTime={playingTurnId === turn.id ? currentTime : 0}
                        duration={playingTurnId === turn.id ? duration : 0}
                        onPlayPause={() => togglePlay(turn.id, audio.url)}
                        onSeek={(time) => seek(time)}
                        variant="compact"
                        className={cn(
                          turn.role === "assistant"
                            ? "[&_button]:text-primary-foreground [&_span]:text-primary-foreground/70 [&_div]:bg-primary-foreground/20"
                            : "[&_button]:text-secondary-foreground [&_span]:text-secondary-foreground/70 [&_div]:bg-secondary-foreground/20"
                        )}
                      />
                      <p className="text-xs font-medium truncate">{audio.title}</p>
                    </div>
                  ) : image ? (
                    <div className="space-y-2">
                      <a
                        href={image.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block overflow-hidden rounded-lg border border-white/10"
                      >
                        <img
                          src={image.url}
                          alt={image.caption ?? "Imagem recebida"}
                          loading="lazy"
                          className="max-h-[320px] w-full rounded-lg object-cover"
                        />
                      </a>
                      {image.caption && (
                        <p className="text-xs leading-relaxed opacity-90">
                          {image.caption}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap text-sm">{turn.content}</p>
                  )}
                    <p
                      className={cn(
                        "mt-2 text-[11px]",
                        turn.role === "assistant"
                          ? "text-primary-foreground/80"
                          : "text-secondary-foreground/70",
                      )}
                    >
                      {getTurnLabel(turn)} • {formatDateTime(turn.createdAt)}
                    </p>
                </div>
              );
            })}
            {aiProcessing && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                IA processando...
              </div>
            )}
            <div ref={scrollRef} />
          </div>
        </div>
      </CardContent>

      {/* Human chat input — always visible but indicates when bot is enabled */}
      <Separator />
      <div className="flex items-center gap-2 p-3">
        <Input
          placeholder={
            botEnabled
              ? "Bot ativo — desative para enviar manualmente"
              : "Digite sua mensagem..."
          }
          value={messageText}
          onChange={(e) => setMessageText(e.target.value)}
          disabled={botEnabled || sending}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void sendMessage();
            }
          }}
        />
        <Button
          size="sm"
          disabled={botEnabled || sending || !messageText.trim()}
          onClick={() => void sendMessage()}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}
