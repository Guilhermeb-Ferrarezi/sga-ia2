import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCcw } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useWebSocket } from "@/contexts/WebSocketContext";
import { api, type DashboardConversation } from "@/lib/api";
import {
  getMessagePreviewText,
  parseImageMessageContent,
} from "@/lib/messageContent";
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
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  LeadOriginBadge,
  getLeadOriginMeta,
  resolveLeadOriginChannel,
  type LeadOriginChannel,
} from "@/components/dashboard/LeadOriginBadge";
import ConversationDetail from "./ConversationDetail";

type ChannelFilter = "all" | LeadOriginChannel;

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
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedFromQuery = searchParams.get("phone");
  const listRef = useRef<HTMLDivElement | null>(null);

  const filteredConversations = useMemo(
    () =>
      conversations.filter((conversation) => {
        const resolvedChannel = resolveLeadOriginChannel(undefined, conversation.phone);
        if (channelFilter !== "all" && resolvedChannel !== channelFilter) return false;

        const query = searchTerm.trim().toLowerCase();
        if (!query) return true;

        const haystack = [
          conversation.name,
          conversation.phone,
          conversation.lastMessagePreview,
          resolvedChannel === "INSTAGRAM" ? "instagram" : "whatsapp",
        ]
          .filter((value): value is string => Boolean(value))
          .join(" ")
          .toLowerCase();

        return haystack.includes(query);
      }),
    [conversations, channelFilter, searchTerm],
  );

  const conversationOriginCounts = useMemo(
    () =>
      conversations.reduce(
        (summary, conversation) => {
          summary.total += 1;
          summary[resolveLeadOriginChannel(undefined, conversation.phone)] += 1;
          return summary;
        },
        { total: 0, WHATSAPP: 0, INSTAGRAM: 0 },
      ),
    [conversations],
  );

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
                : `${filteredConversations.length} de ${conversations.length} conversa(s) registradas.`}
            </CardDescription>
          </CardHeader>
          <Separator />
          <CardContent className="min-h-0 flex-1 p-0">
            <div ref={listRef} className="h-full overflow-y-auto">
              <div className="p-3">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Buscar por nome, numero ou mensagem..."
                    className="sm:flex-1"
                  />
                  <select
                    value={channelFilter}
                    onChange={(event) => setChannelFilter(event.target.value as ChannelFilter)}
                    className="h-10 rounded-lg border border-input bg-background px-3 text-sm sm:w-[180px]"
                  >
                    <option value="all">Todos os canais</option>
                    <option value="WHATSAPP">
                      WhatsApp ({conversationOriginCounts.WHATSAPP})
                    </option>
                    <option value="INSTAGRAM">
                      Instagram ({conversationOriginCounts.INSTAGRAM})
                    </option>
                  </select>
                </div>
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
                {!loading && filteredConversations.length > 0 && (
                  <div className="space-y-2">
                    {filteredConversations.map((conversation) => {
                      const originMeta = getLeadOriginMeta(undefined, conversation.phone);
                      const previewImage = parseImageMessageContent(
                        conversation.lastMessageBody,
                      );

                      return (
                        <button
                          key={conversation.phone}
                          type="button"
                          onClick={() => handleSelectPhone(conversation.phone)}
                          className={cn(
                            "relative w-full overflow-hidden rounded-xl border px-3 py-2 text-left transition",
                            originMeta.panelClass,
                            selectedPhone === conversation.phone
                              ? "border-primary bg-primary/10 ring-1 ring-primary/40"
                              : "border-border bg-background/50 hover:bg-muted/70",
                          )}
                        >
                          <div
                            className={cn(
                              "absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b",
                              originMeta.railClass,
                            )}
                          />
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
                          <LeadOriginBadge
                            waId={conversation.phone}
                            compact
                            className="mt-1"
                          />
                          {previewImage && (
                            <div className="mt-2 overflow-hidden rounded-lg border border-border/70 bg-background/60">
                              <img
                                src={previewImage.url}
                                alt={previewImage.caption ?? "Imagem recebida"}
                                loading="lazy"
                                className="h-24 w-full object-cover"
                              />
                            </div>
                          )}
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {getMessagePreviewText(conversation.lastMessageBody)}
                          </p>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {formatDateTime(conversation.lastMessageAt)}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}
                {!loading && !filteredConversations.length && (
                  <p className="px-1 py-4 text-sm text-muted-foreground">
                    {conversations.length
                      ? "Nenhuma conversa neste canal."
                      : "Nenhuma conversa registrada ainda."}
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
