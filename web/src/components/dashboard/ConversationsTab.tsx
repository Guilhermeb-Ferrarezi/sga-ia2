import { useCallback, useEffect, useState } from "react";
import { RefreshCcw } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useWebSocket, type WsEventPayload } from "@/contexts/WebSocketContext";
import { api, type DashboardConversation } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import ConversationDetail from "./ConversationDetail";

const formatDateTime = (value: string): string =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));

export default function ConversationsTab() {
  const { token, logout } = useAuth();
  const { subscribe } = useWebSocket();
  const [searchParams, setSearchParams] = useSearchParams();
  const [conversations, setConversations] = useState<DashboardConversation[]>([]);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedFromQuery = searchParams.get("phone");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.conversations(token, 60);
      setConversations(data);
      setSelectedPhone((prev) => prev ?? data[0]?.phone ?? null);
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

  // Update conversation list on new messages
  useEffect(() => {
    return subscribe((event: WsEventPayload) => {
      if (event.type === "message:new") {
        // Refresh conversation list to update previews and counts
        void load();
      }
    });
  }, [subscribe, load]);

  useEffect(() => {
    if (!selectedFromQuery) return;
    setSelectedPhone(selectedFromQuery);
  }, [selectedFromQuery]);

  const handleSelectPhone = (phone: string) => {
    setSelectedPhone(phone);
    const currentPhone = searchParams.get("phone");
    if (currentPhone === phone) return;
    const next = new URLSearchParams(searchParams);
    next.set("phone", phone);
    setSearchParams(next);
  };

  return (
    <div className="stagger space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Conversas</h2>
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

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-4">
          <CardHeader className="pb-3">
            <CardTitle>Contatos</CardTitle>
            <CardDescription>
              {conversations.length} conversa(s) registradas.
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
                    onClick={() => handleSelectPhone(conversation.phone)}
                    className={cn(
                      "w-full rounded-lg border px-3 py-2 text-left transition",
                      selectedPhone === conversation.phone
                        ? "border-primary bg-primary/10"
                        : "border-border bg-background/50 hover:bg-muted/70",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-medium">
                        {conversation.name
                          ? `${conversation.name} (${conversation.phone})`
                          : conversation.phone}
                      </p>
                      <Badge variant="secondary">
                        {conversation.messagesCount}
                      </Badge>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {conversation.lastMessagePreview}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {formatDateTime(conversation.lastMessageAt)}
                    </p>
                  </button>
                ))}
                {!conversations.length && (
                  <p className="px-1 py-4 text-sm text-muted-foreground">
                    Nenhuma conversa registrada ainda.
                  </p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {selectedPhone ? (
          <ConversationDetail
            key={selectedPhone}
            phone={selectedPhone}
            contactName={
              conversations.find((conversation) => conversation.phone === selectedPhone)
                ?.name ?? null
            }
          />
        ) : (
          <Card className="flex items-center justify-center lg:col-span-8">
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Selecione um contato para ver as mensagens.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
