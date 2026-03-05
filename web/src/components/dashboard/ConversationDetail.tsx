import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, BotOff, Loader2, Send } from "lucide-react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import LoadingScreen from "@/components/ui/loading-screen";

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
  const { subscribe } = useWebSocket();
  const [turns, setTurns] = useState<DashboardTurn[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiProcessing, setAiProcessing] = useState(false);
  const [botEnabled, setBotEnabled] = useState(initialBotEnabled ?? true);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    setTimeout(() => {
      scrollRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  };

  const loadTurns = useCallback(async () => {
    if (!token || !phone) return;
    setLoading(true);
    try {
      const data = await api.conversationTurns(token, phone, 500);
      setTurns(data);
      scrollToBottom();
    } catch (err: unknown) {
      if (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 401) {
        logout();
      }
    } finally {
      setLoading(false);
    }
  }, [token, phone, logout]);

  useEffect(() => {
    void loadTurns();
  }, [loadTurns]);

  // Real-time message updates
  useEffect(() => {
    return subscribe((event: WsEventPayload) => {
      if (event.type === "message:new" && event.payload.phone === phone) {
        const newTurn: DashboardTurn = {
          id: `ws-${Date.now()}`,
          role: event.payload.role as string,
          content: event.payload.content as string,
          createdAt: new Date().toISOString(),
        };
        setTurns((prev) => [...prev, newTurn]);
        scrollToBottom();
      }
      if (event.type === "ai:processing" && event.payload.phone === phone) {
        setAiProcessing(true);
      }
      if (event.type === "ai:done" && event.payload.phone === phone) {
        setAiProcessing(false);
      }
    });
  }, [subscribe, phone]);

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
    <Card className="flex h-full flex-col lg:col-span-8">
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
      <CardContent className="flex-1 p-0">
        <ScrollArea className="h-[460px]">
          <div className="space-y-3 p-4">
            {loading ? (
              <LoadingScreen
                variant="content"
                className="min-h-[360px] px-2 py-6"
                title="Carregando chat"
                description="Buscando mensagens desta conversa."
              />
            ) : null}
            {!loading && !turns.length && (
              <p className="text-sm text-muted-foreground">
                Sem mensagens para este contato.
              </p>
            )}
            {!loading && turns.map((turn) => (
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
            {aiProcessing && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                IA processando...
              </div>
            )}
            <div ref={scrollRef} />
          </div>
        </ScrollArea>
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
