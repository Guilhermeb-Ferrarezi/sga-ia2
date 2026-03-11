import { useCallback, useEffect, useRef, useState, type UIEvent } from "react";
import { Bot, BotOff, Loader2, Pause, Play, Send } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useWebSocket, type WsEventPayload } from "@/contexts/WebSocketContext";
import { api, type DashboardTurn } from "@/lib/api";
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

const TURNS_PAGE_SIZE = 120;

const AUDIO_TAG_RE = /^\[AUDIO:(.+?)\|(.+?)]$/;

const parseAudioContent = (
  content: string,
): { url: string; title: string } | null => {
  const match = AUDIO_TAG_RE.exec(content.trim());
  if (!match) return null;
  return { url: match[1], title: match[2] };
};

const formatDateTime = (value: string): string =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));

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
  const [turnsLimit, setTurnsLimit] = useState(TURNS_PAGE_SIZE);
  const [hasMoreTurns, setHasMoreTurns] = useState(true);
  const listRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingTurnId, setPlayingTurnId] = useState<string | null>(null);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setPlayingTurnId(null);
  }, []);

  const togglePlayTurn = useCallback(
    (turnId: string, audioUrl: string) => {
      if (playingTurnId === turnId) {
        stopAudio();
        return;
      }
      stopAudio();
      const el = new Audio(audioUrl);
      el.addEventListener("ended", () => setPlayingTurnId(null));
      audioRef.current = el;
      void el.play();
      setPlayingTurnId(turnId);
    },
    [playingTurnId, stopAudio],
  );

  const scrollToBottom = () => {
    setTimeout(() => {
      scrollRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  };

  const loadTurns = useCallback(async (
    limit: number,
    opts?: { showLoading?: boolean; preserveOffset?: boolean; scrollToEnd?: boolean },
  ) => {
    if (!token || !phone) return;
    const showLoading = opts?.showLoading ?? false;
    const preserveOffset = opts?.preserveOffset ?? false;
    const scrollToEndAfterLoad = opts?.scrollToEnd ?? false;

    const container = listRef.current;
    const previousScrollHeight = preserveOffset ? container?.scrollHeight ?? 0 : 0;
    const previousScrollTop = preserveOffset ? container?.scrollTop ?? 0 : 0;

    if (showLoading) setLoading(true);
    try {
      const data = await api.conversationTurns(token, phone, limit);
      setTurns(data);
      setHasMoreTurns(data.length >= limit);

      if (scrollToEndAfterLoad) {
        scrollToBottom();
      } else if (preserveOffset) {
        setTimeout(() => {
          const current = listRef.current;
          if (!current) return;
          const currentScrollHeight = current.scrollHeight;
          const delta = currentScrollHeight - previousScrollHeight;
          current.scrollTop = Math.max(0, previousScrollTop + delta);
        }, 0);
      }
    } catch (err: unknown) {
      if (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 401) {
        logout();
      }
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [token, phone, logout]);

  useEffect(() => {
    setTurnsLimit(TURNS_PAGE_SIZE);
    setHasMoreTurns(true);
    void loadTurns(TURNS_PAGE_SIZE, { showLoading: true, scrollToEnd: true });
  }, [phone, loadTurns]);

  const scheduleTurnsRefresh = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = setTimeout(() => {
      void loadTurns(turnsLimit);
    }, 220);
  }, [loadTurns, turnsLimit]);

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
          const content =
            typeof event.payload.content === "string" ? event.payload.content : "";
          const role = typeof event.payload.role === "string" ? event.payload.role : "user";

          if (content) {
            const newTurn: DashboardTurn = {
              id: `ws-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              role,
              content,
              createdAt: new Date().toISOString(),
            };
            setTurns((prev) => [...prev, newTurn]);
          }
          scrollToBottom();
          scheduleTurnsRefresh();
        }
        if (event.type === "ai:processing") {
          setAiProcessing(true);
        }
        if (event.type === "ai:done") {
          setAiProcessing(false);
          scheduleTurnsRefresh();
        }
      },
      { types: ["message:new", "message:sent", "ai:processing", "ai:done"], waId: phone },
    );
  }, [subscribeFiltered, phone, scheduleTurnsRefresh]);

  const handleTurnsScroll = async (event: UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    if (loading || loadingMore || !hasMoreTurns) return;
    if (target.scrollTop > 24) return;

    const nextLimit = turnsLimit + TURNS_PAGE_SIZE;
    setLoadingMore(true);
    setTurnsLimit(nextLimit);
    try {
      await loadTurns(nextLimit, { preserveOffset: true });
    } finally {
      setLoadingMore(false);
    }
  };

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
              Conversa com {contactName ? `${contactName} (${phone})` : phone}
              {aiProcessing && (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              )}
            </CardTitle>
            <CardDescription>
              {turns.length} mensagem(ns)
            </CardDescription>
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
          onScroll={(event) => {
            void handleTurnsScroll(event);
          }}
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
            {!loading && loadingMore && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Carregando mensagens antigas...
              </div>
            )}
            {!loading && !turns.length && (
              <p className="text-sm text-muted-foreground">
                Sem mensagens para este contato.
              </p>
            )}
            {!loading && turns.map((turn) => {
              const audio = parseAudioContent(turn.content);
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
                    <div className="flex items-center gap-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                          "h-9 w-9 shrink-0 rounded-full p-0",
                          turn.role === "assistant"
                            ? "hover:bg-primary-foreground/20 text-primary-foreground"
                            : "hover:bg-secondary-foreground/20 text-secondary-foreground",
                        )}
                        onClick={() => togglePlayTurn(turn.id, audio.url)}
                      >
                        {playingTurnId === turn.id ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </Button>
                      <span className="text-sm font-medium truncate">
                        {audio.title}
                      </span>
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
                    {turn.role} • {formatDateTime(turn.createdAt)}
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
