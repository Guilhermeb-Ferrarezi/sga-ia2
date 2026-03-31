import { useCallback, useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Loader2, RefreshCcw } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useWebSocket } from "@/contexts/WebSocketContext";
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
import { Separator } from "@/components/ui/separator";
import ConversationDetail from "./ConversationDetail";

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

export default function ConversationsTab() {
  const { token, logout } = useAuth();
  const { subscribeFiltered } = useWebSocket();
  const [searchParams, setSearchParams] = useSearchParams();
  const [conversations, setConversations] = useState<DashboardConversation[]>([]);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedFromQuery = searchParams.get("phone");
  const listRef = useRef<HTMLDivElement | null>(null);

  const rowVirtualizer = useVirtualizer({
    count: conversations.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 110,
    overscan: 8,
  });

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
    return subscribeFiltered(
      () => { void load(); },
      { types: ["message:new", "message:sent", "contact:updated", "contact:deleted"] },
    );
  }, [subscribeFiltered, load]);

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
    <div className="stagger flex h-[calc(100dvh-4rem-2rem)] min-h-[620px] flex-col space-y-5 overflow-hidden sm:h-[calc(100dvh-4rem-3rem)] lg:h-[calc(100dvh-4rem-3.5rem)]">
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

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-12">
        <Card className="flex min-h-0 flex-col lg:col-span-4">
          <CardHeader className="pb-3">
            <CardTitle>Contatos</CardTitle>
            <CardDescription>
              {loading
                ? "Carregando conversas..."
                : `${conversations.length} conversa(s) registradas.`}
            </CardDescription>
          </CardHeader>
          <Separator />
          <CardContent className="min-h-0 flex-1 p-0">
            <div ref={listRef} className="h-full overflow-y-auto">
              <div className="p-3">
                {loading && (
                  <div className="space-y-2 p-1">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="rounded-lg border border-border/40 p-3 space-y-2 animate-pulse">
                        <div className="h-3.5 w-1/2 rounded-md bg-muted/60" />
                        <div className="h-3 w-3/4 rounded-md bg-muted/60" />
                      </div>
                    ))}
                  </div>
                )}
                {!loading && conversations.length > 0 && (
                  <div className="relative" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
                    {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                      const conversation = conversations[virtualRow.index];
                      if (!conversation) return null;

                      return (
                        <div
                          key={conversation.phone}
                          className="absolute left-0 top-0 w-full"
                          style={{ transform: `translateY(${virtualRow.start}px)` }}
                        >
                          <button
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
                                {formatConversationHeading(
                                  conversation.phone,
                                  conversation.name,
                                )}
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
                        </div>
                      );
                    })}
                  </div>
                )}
                {!loading && !conversations.length && (
                  <p className="px-1 py-4 text-sm text-muted-foreground">
                    Nenhuma conversa registrada ainda.
                  </p>
                )}
              </div>
            </div>
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
          <Card className="flex h-full items-center justify-center lg:col-span-8">
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
