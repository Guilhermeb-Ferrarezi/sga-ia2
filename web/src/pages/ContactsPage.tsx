import { useCallback, useEffect, useMemo, useRef, useState, type UIEvent } from "react";
import { motion } from "framer-motion";
import { createPortal } from "react-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Bot,
  BotOff,
  Eye,
  Loader2,
  MessageCircle,
  RefreshCcw,
  Save,
  Trash2,
  UserRoundCheck,
  UserRoundX,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { useWebSocket } from "@/contexts/WebSocketContext";
import { useRetry } from "@/hooks/useRetry";
import { useSavedFilters } from "@/hooks/useSavedFilters";
import { api, type PipelineContact } from "@/lib/api";
import { PERMISSIONS, hasAnyPermission } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  LeadOriginBadge,
  getLeadOriginHint,
  getLeadOriginMeta,
  resolveLeadOriginChannel,
  type LeadOriginChannel,
} from "@/components/dashboard/LeadOriginBadge";
import TagBadge from "@/components/dashboard/TagBadge";
import { SkeletonContactCard } from "@/components/ui/skeleton";

type LeadStatus = "open" | "won" | "lost";
type ChannelFilter = "all" | LeadOriginChannel;

type DetailsFormState = {
  name: string;
  email: string;
  tournament: string;
  eventDate: string;
  category: string;
  city: string;
  teamName: string;
  playersCount: string;
  source: string;
  notes: string;
  handoffReason: string;
  triageCompleted: boolean;
  handoffRequested: boolean;
  botEnabled: boolean;
};

const leadStatusMeta: Record<LeadStatus, { label: string; badgeClass: string }> = {
  open: {
    label: "Aberto",
    badgeClass: "border-cyan-500/50 bg-cyan-500/10 text-cyan-200",
  },
  won: {
    label: "Ganho",
    badgeClass: "border-emerald-500/50 bg-emerald-500/10 text-emerald-200",
  },
  lost: {
    label: "Perdido",
    badgeClass: "border-rose-500/50 bg-rose-500/10 text-rose-200",
  },
};

const channelFilterLabel: Record<ChannelFilter, string> = {
  all: "todos",
  WHATSAPP: "WhatsApp",
  INSTAGRAM: "Instagram",
};

const normalizeLeadStatus = (value: string | null | undefined): LeadStatus => {
  if (value === "won" || value === "lost") return value;
  return "open";
};

const formatDate = (value: string | null): string => {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
};

const toText = (value: string | null | undefined): string => value ?? "";

const toNullableText = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const buildDetailsForm = (contact: PipelineContact): DetailsFormState => ({
  name: toText(contact.name),
  email: toText(contact.email),
  tournament: toText(contact.tournament),
  eventDate: toText(contact.eventDate),
  category: toText(contact.category),
  city: toText(contact.city),
  teamName: toText(contact.teamName),
  playersCount:
    typeof contact.playersCount === "number" ? String(contact.playersCount) : "",
  source: toText(contact.source),
  notes: toText(contact.notes),
  handoffReason: toText(contact.handoffReason),
  triageCompleted: Boolean(contact.triageCompleted),
  handoffRequested: Boolean(contact.handoffRequested),
  botEnabled: contact.botEnabled,
});

const CONTACTS_PAGE_SIZE = 120;

export default function ContactsPage() {
  const navigate = useNavigate();
  const { token, logout, user } = useAuth();
  const { subscribeFiltered } = useWebSocket();
  const { toast } = useToast();
  const { run: retryRun } = useRetry();
  const [contacts, setContacts] = useState<PipelineContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMoreContacts, setLoadingMoreContacts] = useState(false);
  const [visibleContactsCount, setVisibleContactsCount] = useState(CONTACTS_PAGE_SIZE);
  const [deletingWaId, setDeletingWaId] = useState<string | null>(null);

  const contactFilterDefaults = {
    search: "" as string,
    statusFilter: "all" as "all" | LeadStatus,
    botFilter: "all" as "all" | "on" | "off",
    handoffFilter: "all" as "all" | "yes" | "no",
    channelFilter: "all" as ChannelFilter,
  };
  const [filters, setFilter] = useSavedFilters("contacts", contactFilterDefaults);
  const { search, statusFilter, botFilter, handoffFilter, channelFilter } = filters;

  const [detailsContact, setDetailsContact] = useState<PipelineContact | null>(null);
  const [detailsForm, setDetailsForm] = useState<DetailsFormState | null>(null);
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsTagId, setDetailsTagId] = useState<string>("");
  const [tagsCatalog, setTagsCatalog] = useState<Array<{ id: number; name: string; color: string }>>([]);
  const [selectedWaIds, setSelectedWaIds] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);
  const [auditLog, setAuditLog] = useState<Array<{ id: number; action: string; field: string | null; oldValue: string | null; newValue: string | null; createdAt: string; user: { name: string | null; email: string } | null }>>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const canManageLeads = hasAnyPermission(user, [
    PERMISSIONS.LEADS_MANAGE_STATUS,
    PERMISSIONS.LEADS_MANAGE_STAGE,
    PERMISSIONS.LEADS_DELETE,
  ]);
  const contactsListRef = useRef<HTMLDivElement | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [board, tagData] = await Promise.all([
        api.pipelineBoard(token, { limit: 100 }),
        api.tags(token, { limit: 200, offset: 0 }),
      ]);
      const allContacts = [
        ...board.unassigned.items,
        ...board.stages.flatMap((stage) => stage.items),
      ].sort((a, b) => {
        const aTime = a.lastInteractionAt ? new Date(a.lastInteractionAt).getTime() : 0;
        const bTime = b.lastInteractionAt ? new Date(b.lastInteractionAt).getTime() : 0;
        return bTime - aTime;
      });
      setContacts(allContacts);
      setVisibleContactsCount(CONTACTS_PAGE_SIZE);
      setTagsCatalog(tagData.items);
    } catch (err: unknown) {
      if (
        err &&
        typeof err === "object" &&
        "status" in err &&
        (err as { status: number }).status === 401
      ) {
        logout();
        return;
      }
      toast({
        title: "Falha ao carregar contatos",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [token, logout, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return subscribeFiltered(
      () => {
        if (refreshTimerRef.current) {
          clearTimeout(refreshTimerRef.current);
        }
        refreshTimerRef.current = setTimeout(() => {
          void load();
        }, 180);
      },
      {
        types: [
          "message:new",
          "contact:updated",
          "contact:deleted",
          "pipeline:updated",
          "contacts:batch",
        ],
      },
    );
  }, [subscribeFiltered, load]);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!detailsContact) {
      setDetailsForm(null);
      setDetailsTagId("");
      return;
    }
    setDetailsForm(buildDetailsForm(detailsContact));
    setDetailsTagId("");
    // Load audit log
    if (token && detailsContact.waId) {
      setAuditLoading(true);
      api.contactAuditLog(token, detailsContact.waId)
        .then(setAuditLog)
        .catch(() => setAuditLog([]))
        .finally(() => setAuditLoading(false));
    }
  }, [detailsContact?.waId]);

  const filteredContacts = useMemo(() => {
    const term = search.trim().toLowerCase();

    return contacts.filter((contact) => {
      const leadStatus = normalizeLeadStatus(contact.leadStatus);
      const resolvedChannel = resolveLeadOriginChannel(contact.channel, contact.waId);
      if (statusFilter !== "all" && leadStatus !== statusFilter) return false;
      if (channelFilter !== "all" && resolvedChannel !== channelFilter) return false;

      if (botFilter === "on" && !contact.botEnabled) return false;
      if (botFilter === "off" && contact.botEnabled) return false;

      if (handoffFilter === "yes" && !contact.handoffRequested) return false;
      if (handoffFilter === "no" && contact.handoffRequested) return false;

      if (!term) return true;

      const stageName = contact.stageId ? `etapa-${contact.stageId}` : "sem-estagio";
      const haystack = [
        contact.name,
        contact.waId,
        contact.email,
        contact.city,
        contact.tournament,
        contact.category,
        contact.teamName,
        contact.source,
        contact.platformHandle,
        resolvedChannel === "INSTAGRAM" ? "instagram" : "whatsapp",
        stageName,
      ]
        .filter((value): value is string => Boolean(value))
        .join(" ")
        .toLowerCase();

      return haystack.includes(term);
    });
  }, [contacts, search, statusFilter, botFilter, handoffFilter, channelFilter]);

  const contactOriginCounts = useMemo(
    () =>
      contacts.reduce(
        (summary, contact) => {
          summary.total += 1;
          const resolvedChannel = resolveLeadOriginChannel(contact.channel, contact.waId);
          summary[resolvedChannel] += 1;
          return summary;
        },
        { total: 0, WHATSAPP: 0, INSTAGRAM: 0 },
      ),
    [contacts],
  );

  useEffect(() => {
    setVisibleContactsCount(CONTACTS_PAGE_SIZE);
  }, [search, statusFilter, botFilter, handoffFilter, channelFilter]);

  const displayedContacts = useMemo(
    () => filteredContacts.slice(0, visibleContactsCount),
    [filteredContacts, visibleContactsCount],
  );

  const contactsVirtualizer = useVirtualizer({
    count: displayedContacts.length,
    getScrollElement: () => contactsListRef.current,
    estimateSize: () => 176,
    overscan: 6,
  });

  const handleContactsScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    if (loading || loadingMoreContacts) return;
    if (visibleContactsCount >= filteredContacts.length) return;

    const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (distanceToBottom > 160) return;

    setLoadingMoreContacts(true);
    setVisibleContactsCount((prev) => Math.min(prev + CONTACTS_PAGE_SIZE, filteredContacts.length));
    setTimeout(() => setLoadingMoreContacts(false), 120);
  }, [loading, loadingMoreContacts, visibleContactsCount, filteredContacts.length]);

  const availableTagsForDetails = useMemo(() => {
    if (!detailsContact) return [];
    const assigned = new Set(detailsContact.tags.map((ct) => ct.tag.id));
    return tagsCatalog.filter((tag) => !assigned.has(tag.id));
  }, [detailsContact, tagsCatalog]);

  const updateDetailsField = <K extends keyof DetailsFormState>(
    key: K,
    value: DetailsFormState[K],
  ) => {
    setDetailsForm((current) =>
      current
        ? {
            ...current,
            [key]: value,
          }
        : current,
    );
  };

  const refreshAndKeepDetails = async (waId: string) => {
    if (!token) return;
    const board = await api.pipelineBoard(token, { limit: 100 });
    const allContacts = [
      ...board.unassigned.items,
      ...board.stages.flatMap((stage) => stage.items),
    ].sort((a, b) => {
      const aTime = a.lastInteractionAt ? new Date(a.lastInteractionAt).getTime() : 0;
      const bTime = b.lastInteractionAt ? new Date(b.lastInteractionAt).getTime() : 0;
      return bTime - aTime;
    });
    setContacts(allContacts);
    const refreshed = allContacts.find((contact) => contact.waId === waId) ?? null;
    setDetailsContact(refreshed);
    if (refreshed) {
      setDetailsForm(buildDetailsForm(refreshed));
    }
  };

  const saveDetails = async () => {
    if (!token || !detailsContact || !detailsForm) return;

    const playersRaw = detailsForm.playersCount.trim();
    if (playersRaw && !Number.isFinite(Number(playersRaw))) {
      toast({
        title: "Quantidade de jogadores invalida",
        description: "Use apenas numeros.",
        variant: "error",
      });
      return;
    }

    setSavingDetails(true);
    try {
      await retryRun(
        () =>
          api.updateContact(token, detailsContact.waId, {
            name: toNullableText(detailsForm.name),
            email: toNullableText(detailsForm.email),
            tournament: toNullableText(detailsForm.tournament),
            eventDate: toNullableText(detailsForm.eventDate),
            category: toNullableText(detailsForm.category),
            city: toNullableText(detailsForm.city),
            teamName: toNullableText(detailsForm.teamName),
            playersCount: playersRaw ? Number(playersRaw) : null,
            source: toNullableText(detailsForm.source),
            notes: toNullableText(detailsForm.notes),
            handoffReason: detailsForm.handoffRequested
              ? toNullableText(detailsForm.handoffReason)
              : null,
            handoffRequested: detailsForm.handoffRequested,
            handoffAt: detailsForm.handoffRequested
              ? detailsContact.handoffAt ?? new Date().toISOString()
              : null,
            triageCompleted: detailsForm.triageCompleted,
            botEnabled: detailsForm.botEnabled,
          }),
        { actionLabel: "Salvar contato" },
      );
      await refreshAndKeepDetails(detailsContact.waId);
    } finally {
      setSavingDetails(false);
    }
  };

  const addTagToDetails = async () => {
    if (!token || !detailsContact || !detailsTagId) return;
    const tagId = Number(detailsTagId);
    if (!Number.isFinite(tagId)) return;

    setSavingDetails(true);
    try {
      await api.addContactTag(token, detailsContact.waId, tagId);
      setDetailsTagId("");
      await refreshAndKeepDetails(detailsContact.waId);
    } finally {
      setSavingDetails(false);
    }
  };

  const removeTagFromDetails = async (tagId: number) => {
    if (!token || !detailsContact) return;

    setSavingDetails(true);
    try {
      await api.removeContactTag(token, detailsContact.waId, tagId);
      await refreshAndKeepDetails(detailsContact.waId);
    } finally {
      setSavingDetails(false);
    }
  };

  const deleteLead = async (contact: PipelineContact) => {
    if (!token) return;
    if (!canManageLeads) {
      toast({ title: "Sem permissão para excluir lead", variant: "error" });
      return;
    }
    const confirmed = window.confirm(
      `Excluir o lead "${contact.name || contact.waId}"? Esta acao remove mensagens e historico.`,
    );
    if (!confirmed) return;

    setDeletingWaId(contact.waId);
    try {
      const result = await retryRun(
        () => api.deleteContact(token, contact.waId),
        { actionLabel: "Excluir lead" },
      );
      if (result !== undefined) {
        if (detailsContact?.waId === contact.waId) {
          setDetailsContact(null);
        }
        await load();
      }
    } finally {
      setDeletingWaId((current) => (current === contact.waId ? null : current));
    }
  };

  return (
    <motion.div className="space-y-5" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: "easeOut" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold">Contatos</h2>
        <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCcw className={cn("h-4 w-4", loading && "animate-spin")} />
          Atualizar
        </Button>
      </div>

      <Card className="border-border/70">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <Input
            value={search}
            onChange={(event) => setFilter("search", event.target.value)}
            placeholder="Buscar por nome, numero, email, cidade..."
          />
          <select
            value={statusFilter}
            onChange={(event) => setFilter("statusFilter", event.target.value as "all" | LeadStatus)}
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
          >
            <option value="all">Status: todos</option>
            <option value="open">Status: aberto</option>
            <option value="won">Status: ganho</option>
            <option value="lost">Status: perdido</option>
          </select>
          <select
            value={botFilter}
            onChange={(event) => setFilter("botFilter", event.target.value as "all" | "on" | "off")}
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
          >
            <option value="all">Bot: todos</option>
            <option value="on">Bot: ligado</option>
            <option value="off">Bot: desligado</option>
          </select>
          <select
            value={handoffFilter}
            onChange={(event) =>
              setFilter("handoffFilter", event.target.value as "all" | "yes" | "no")
            }
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
          >
            <option value="all">Handoff: todos</option>
            <option value="yes">Handoff: sim</option>
            <option value="no">Handoff: nao</option>
          </select>
          <select
            value={channelFilter}
            onChange={(event) => setFilter("channelFilter", event.target.value as ChannelFilter)}
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
          >
            <option value="all">Origem: todas</option>
            <option value="WHATSAPP">Origem: WhatsApp</option>
            <option value="INSTAGRAM">Origem: Instagram</option>
          </select>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-border/70">
        <CardContent className="grid gap-3 p-3 md:grid-cols-3">
          <button
            type="button"
            onClick={() => setFilter("channelFilter", "all")}
            className={cn(
              "rounded-2xl border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] p-4 text-left transition hover:-translate-y-0.5 hover:border-white/20",
              channelFilter === "all" && "ring-1 ring-white/20",
            )}
          >
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Todos os leads</p>
            <p className="mt-3 text-3xl font-semibold tracking-tight">{contactOriginCounts.total}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {channelFilter === "all" ? "Exibindo todos os canais" : "Clique para limpar o filtro"}
            </p>
          </button>
          {(["WHATSAPP", "INSTAGRAM"] as const).map((originChannel) => {
            const originMeta = getLeadOriginMeta(originChannel);
            const OriginIcon = originMeta.Icon;
            const isActive = channelFilter === originChannel;
            return (
              <button
                key={originChannel}
                type="button"
                onClick={() =>
                  setFilter("channelFilter", isActive ? "all" : originChannel)
                }
                className={cn(
                  "rounded-2xl border p-4 text-left transition hover:-translate-y-0.5",
                  originMeta.panelClass,
                  isActive && "ring-1 ring-white/20",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      Origem
                    </p>
                    <p className="mt-2 text-lg font-semibold">{originMeta.label}</p>
                  </div>
                  <div
                    className={cn(
                      "flex h-11 w-11 items-center justify-center rounded-2xl backdrop-blur",
                      originMeta.iconWrapClass,
                    )}
                  >
                    <OriginIcon className="h-5 w-5" />
                  </div>
                </div>
                <p className="mt-4 text-3xl font-semibold tracking-tight">
                  {contactOriginCounts[originChannel]}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {isActive ? "Filtro ativo neste canal" : "Clique para separar os leads deste canal"}
                </p>
              </button>
            );
          })}
        </CardContent>
      </Card>

      {selectedWaIds.size > 0 && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="flex flex-wrap items-center gap-2 p-3">
            <span className="text-sm font-medium">{selectedWaIds.size} selecionado(s)</span>
            <Button
              size="sm"
              variant="secondary"
              disabled={batchBusy}
              onClick={() => setSelectedWaIds(new Set())}
            >
              Limpar
            </Button>
            {canManageLeads && (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={batchBusy}
                  onClick={async () => {
                    if (!token) return;
                    setBatchBusy(true);
                    try {
                      await api.batchContacts(token, [...selectedWaIds], "changeStatus", { status: "won" });
                      toast({ title: `${selectedWaIds.size} contatos marcados como ganho`, variant: "success" });
                      setSelectedWaIds(new Set());
                      await load();
                    } catch {
                      toast({ title: "Falha na ação em lote", variant: "error" });
                    } finally {
                      setBatchBusy(false);
                    }
                  }}
                >
                  Marcar ganho
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={batchBusy}
                  onClick={async () => {
                    if (!token) return;
                    setBatchBusy(true);
                    try {
                      await api.batchContacts(token, [...selectedWaIds], "changeStatus", { status: "lost" });
                      toast({ title: `${selectedWaIds.size} contatos marcados como perdido`, variant: "success" });
                      setSelectedWaIds(new Set());
                      await load();
                    } catch {
                      toast({ title: "Falha na ação em lote", variant: "error" });
                    } finally {
                      setBatchBusy(false);
                    }
                  }}
                >
                  Marcar perdido
                </Button>
              </>
            )}
            <Button
              size="sm"
              variant="secondary"
              disabled={batchBusy}
              onClick={async () => {
                if (!token) return;
                setBatchBusy(true);
                try {
                  await api.batchContacts(token, [...selectedWaIds], "toggleBot", { botEnabled: false });
                  toast({ title: `Bot desligado em ${selectedWaIds.size} contatos`, variant: "success" });
                  setSelectedWaIds(new Set());
                  await load();
                } catch {
                  toast({ title: "Falha na ação em lote", variant: "error" });
                } finally {
                  setBatchBusy(false);
                }
              }}
            >
              Desligar bot
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={batchBusy}
              onClick={async () => {
                if (!token) return;
                setBatchBusy(true);
                try {
                  await api.batchContacts(token, [...selectedWaIds], "requestHandoff");
                  toast({ title: `Handoff solicitado para ${selectedWaIds.size} contatos`, variant: "success" });
                  setSelectedWaIds(new Set());
                  await load();
                } catch {
                  toast({ title: "Falha na ação em lote", variant: "error" });
                } finally {
                  setBatchBusy(false);
                }
              }}
            >
              Encaminhar handoff
            </Button>
            {tagsCatalog.length > 0 && (
              <select
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                defaultValue=""
                disabled={batchBusy}
                onChange={async (e) => {
                  const tagId = Number(e.target.value);
                  if (!tagId || !token) return;
                  e.target.value = "";
                  setBatchBusy(true);
                  try {
                    await api.batchContacts(token, [...selectedWaIds], "addTag", { tagId });
                    toast({ title: `Tag adicionada a ${selectedWaIds.size} contatos`, variant: "success" });
                    setSelectedWaIds(new Set());
                    await load();
                  } catch {
                    toast({ title: "Falha na ação em lote", variant: "error" });
                  } finally {
                    setBatchBusy(false);
                  }
                }}
              >
                <option value="">+ Tag em lote</option>
                {tagsCatalog.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {loading && !contacts.length && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonContactCard key={i} />
            ))}
          </div>
        )}

        {!loading && !filteredContacts.length && (
          <p className="text-sm text-muted-foreground">Nenhum contato encontrado.</p>
        )}

        {filteredContacts.length > 0 && (
          <div
            ref={contactsListRef}
            className="max-h-[68vh] overflow-y-auto pr-1"
            onScroll={handleContactsScroll}
          >
            <div className="relative" style={{ height: `${contactsVirtualizer.getTotalSize()}px` }}>
              {contactsVirtualizer.getVirtualItems().map((virtualRow) => {
                const contact = displayedContacts[virtualRow.index];
                if (!contact) return null;
                const status = normalizeLeadStatus(contact.leadStatus);
                const originMeta = getLeadOriginMeta(contact.channel, contact.waId);
                const isDeleting = deletingWaId === contact.waId;
                const isSelected = selectedWaIds.has(contact.waId);
                return (
                  <div
                    key={contact.waId}
                    className="absolute left-0 top-0 w-full"
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  >
                    <Card
                      className={cn(
                        "animate-fade-up relative overflow-hidden border-border/70 transition hover:-translate-y-0.5",
                        originMeta.panelClass,
                        isDeleting && "pointer-events-none opacity-70",
                        isSelected && "ring-1 ring-primary/50",
                      )}
                    >
                      <div
                        className={cn(
                          "absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b",
                          originMeta.railClass,
                        )}
                      />
                      <CardContent className="space-y-3 p-3 pl-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="flex min-w-0 items-start gap-2">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={(checked) => {
                                setSelectedWaIds((prev) => {
                                  const next = new Set(prev);
                                  if (checked) next.add(contact.waId);
                                  else next.delete(contact.waId);
                                  return next;
                                });
                              }}
                              className="mt-0.5"
                            />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold">{contact.name || "Sem nome"}</p>
                              <LeadOriginBadge
                                channel={contact.channel}
                                waId={contact.waId}
                                source={contact.source}
                                platformHandle={contact.platformHandle}
                                showHint
                                compact
                                className="mt-1"
                              />
                              <p className="truncate text-xs text-muted-foreground">{contact.waId}</p>
                              <p className="text-xs text-muted-foreground">
                                Ultima interacao: {formatDate(contact.lastInteractionAt)}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant="outline" className={cn("h-5 px-2 text-[10px]", leadStatusMeta[status].badgeClass)}>
                              {leadStatusMeta[status].label}
                            </Badge>
                            <Badge variant="outline" className="h-5 px-2 text-[10px]">
                              {contact.botEnabled ? "Bot ON" : "Bot OFF"}
                            </Badge>
                            {contact.handoffRequested && (
                              <Badge variant="outline" className="h-5 border-amber-500/50 bg-amber-500/10 px-2 text-[10px] text-amber-200">
                                Handoff
                              </Badge>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              navigate(`/dashboard/conversations?phone=${encodeURIComponent(contact.waId)}`)
                            }
                          >
                            <MessageCircle className="h-4 w-4" />
                            Abrir chat
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setDetailsContact(contact)}
                            disabled={isDeleting}
                          >
                            <Eye className="h-4 w-4" />
                            Ver detalhes
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive"
                            onClick={() => void deleteLead(contact)}
                            disabled={isDeleting || !canManageLeads}
                          >
                            {isDeleting ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                            Excluir lead
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                );
              })}
            </div>
            {loadingMoreContacts && (
              <div className="py-2 text-center text-xs text-muted-foreground">
                Carregando mais contatos...
              </div>
            )}
          </div>
        )}

        {!loading && filteredContacts.length > 0 && (
          <Card className="border-border/70">
            <CardContent className="flex items-center justify-between gap-2 p-3 text-sm">
              <span className="text-muted-foreground">{displayedContacts.length} de {filteredContacts.length} contato(s)</span>
              <span className="text-xs text-muted-foreground">Rolagem otimizada ativa</span>
            </CardContent>
          </Card>
        )}
      </div>

      {detailsContact && detailsForm && createPortal(
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-background/65 px-4 py-6 backdrop-blur-sm"
          onClick={() => setDetailsContact(null)}
        >
          <Card
            className="anim-pop flex max-h-[calc(100vh-3rem)] w-full max-w-4xl flex-col border-border/90"
            onClick={(event) => event.stopPropagation()}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle>{detailsContact.name || detailsContact.waId}</CardTitle>
                  <p className="text-xs text-muted-foreground">{detailsContact.waId}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setDetailsContact(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 overflow-y-auto">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-border/70 bg-background/40 p-3">
                  <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Status</p>
                  <p className="mt-1 text-sm font-medium">
                    {leadStatusMeta[normalizeLeadStatus(detailsContact.leadStatus)].label}
                  </p>
                </div>
                <div className="rounded-lg border border-border/70 bg-background/40 p-3">
                  <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Bot</p>
                  <p className="mt-1 text-sm font-medium">
                    {detailsForm.botEnabled ? "Ativado" : "Desativado"}
                  </p>
                </div>
                <div className="rounded-lg border border-border/70 bg-background/40 p-3">
                  <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Ultima interacao</p>
                  <p className="mt-1 text-sm font-medium">
                    {formatDate(detailsContact.lastInteractionAt)}
                  </p>
                </div>
                <div className="rounded-lg border border-border/70 bg-background/40 p-3">
                  <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Criado em</p>
                  <p className="mt-1 text-sm font-medium">{formatDate(detailsContact.createdAt)}</p>
                </div>
              </div>

              <div
                className={cn(
                  "rounded-2xl border p-4",
                  getLeadOriginMeta(detailsContact.channel, detailsContact.waId).panelClass,
                )}
              >
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  Origem do lead
                </p>
                <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <LeadOriginBadge
                      channel={detailsContact.channel}
                      waId={detailsContact.waId}
                      source={detailsContact.source}
                      platformHandle={detailsContact.platformHandle}
                      showHint
                    />
                    <p className="mt-2 text-xs text-muted-foreground">
                      Identificado como {channelFilterLabel[resolveLeadOriginChannel(detailsContact.channel, detailsContact.waId)]}
                    </p>
                  </div>
                  <div className="max-w-sm text-right text-xs text-muted-foreground">
                    {getLeadOriginHint({
                      channel: detailsContact.channel,
                      waId: detailsContact.waId,
                      source: detailsContact.source,
                      platformHandle: detailsContact.platformHandle,
                    })}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border/70 bg-background/40 p-3">
                <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Acoes rapidas</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      navigate(`/dashboard/conversations?phone=${encodeURIComponent(detailsContact.waId)}`)
                    }
                  >
                    <MessageCircle className="h-4 w-4" />
                    Abrir chat
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => updateDetailsField("botEnabled", !detailsForm.botEnabled)}
                  >
                    {detailsForm.botEnabled ? <BotOff className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                    {detailsForm.botEnabled ? "Desativar bot" : "Ativar bot"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      updateDetailsField("handoffRequested", !detailsForm.handoffRequested)
                    }
                  >
                    {detailsForm.handoffRequested ? (
                      <UserRoundCheck className="h-4 w-4" />
                    ) : (
                      <UserRoundX className="h-4 w-4" />
                    )}
                    {detailsForm.handoffRequested ? "Retomar bot" : "Encaminhar para humano"}
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border border-border/70 bg-background/40 p-3">
                <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Dados de triagem</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Nome</label>
                    <Input value={detailsForm.name} onChange={(e) => updateDetailsField("name", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Email</label>
                    <Input value={detailsForm.email} onChange={(e) => updateDetailsField("email", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Campeonato</label>
                    <Input value={detailsForm.tournament} onChange={(e) => updateDetailsField("tournament", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Data</label>
                    <Input value={detailsForm.eventDate} onChange={(e) => updateDetailsField("eventDate", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Categoria</label>
                    <Input value={detailsForm.category} onChange={(e) => updateDetailsField("category", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Cidade</label>
                    <Input value={detailsForm.city} onChange={(e) => updateDetailsField("city", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Time</label>
                    <Input value={detailsForm.teamName} onChange={(e) => updateDetailsField("teamName", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Jogadores</label>
                    <Input
                      inputMode="numeric"
                      value={detailsForm.playersCount}
                      onChange={(e) => updateDetailsField("playersCount", e.target.value)}
                    />
                  </div>
                </div>
                <div className="mt-2">
                  <Checkbox
                    checked={detailsForm.triageCompleted}
                    onCheckedChange={(checked) => updateDetailsField("triageCompleted", checked)}
                    label="Triagem concluida"
                    className="text-xs text-muted-foreground"
                  />
                </div>
              </div>

              <div className="rounded-lg border border-border/70 bg-background/40 p-3">
                <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Encaminhamento humano</p>
                <div className="mt-2 space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={detailsForm.handoffRequested}
                      onCheckedChange={(checked) => updateDetailsField("handoffRequested", checked)}
                    />
                    Solicitar atendimento humano
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Motivo</label>
                    <Input
                      value={detailsForm.handoffReason}
                      onChange={(e) => updateDetailsField("handoffReason", e.target.value)}
                      disabled={!detailsForm.handoffRequested}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Ultima solicitacao: {detailsContact.handoffAt ? formatDate(detailsContact.handoffAt) : "-"}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-border/70 bg-background/40 p-3">
                <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Tags</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {detailsContact.tags.length > 0 ? (
                    detailsContact.tags.map((ct) => (
                      <div
                        key={ct.tag.id}
                        className="flex items-center gap-1 rounded-md border border-border/60 bg-background/40 px-1.5 py-1"
                      >
                        <TagBadge name={ct.tag.name} color={ct.tag.color} />
                        <button
                          type="button"
                          className="rounded p-0.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                          onClick={() => void removeTagFromDetails(ct.tag.id)}
                          disabled={savingDetails}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">Sem tags</p>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select
                    value={detailsTagId}
                    onChange={(event) => setDetailsTagId(event.target.value)}
                    className="h-9 min-w-[200px] rounded-md border border-input bg-background px-3 text-sm"
                    disabled={!availableTagsForDetails.length || savingDetails}
                  >
                    <option value="">Selecione uma tag</option>
                    {availableTagsForDetails.map((tag) => (
                      <option key={tag.id} value={String(tag.id)}>
                        {tag.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void addTagToDetails()}
                    disabled={!detailsTagId || savingDetails}
                  >
                    Adicionar tag
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border border-border/70 bg-background/40 p-3">
                <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Observacoes</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Origem</label>
                    <Input value={detailsForm.source} onChange={(e) => updateDetailsField("source", e.target.value)} />
                  </div>
                </div>
                <div className="mt-2 space-y-1">
                  <label className="text-xs text-muted-foreground">Notas</label>
                  <textarea
                    value={detailsForm.notes}
                    onChange={(e) => updateDetailsField("notes", e.target.value)}
                    rows={3}
                    className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="destructive"
                  onClick={() => void deleteLead(detailsContact)}
                  disabled={savingDetails || deletingWaId === detailsContact.waId}
                >
                  {deletingWaId === detailsContact.waId ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Excluir lead
                </Button>
                <Button variant="outline" onClick={() => setDetailsContact(null)} disabled={savingDetails}>
                  Fechar
                </Button>
                <Button onClick={() => void saveDetails()} disabled={savingDetails}>
                  {savingDetails ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Salvar dados
                </Button>
              </div>

              {/* ── Histórico de alterações ──────────────── */}
              <div className="mt-4 border-t border-border/60 pt-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Histórico de alterações
                </p>
                {auditLoading && (
                  <p className="text-xs text-muted-foreground">Carregando...</p>
                )}
                {!auditLoading && auditLog.length === 0 && (
                  <p className="text-xs text-muted-foreground">Nenhuma alteração registrada.</p>
                )}
                {!auditLoading && auditLog.length > 0 && (
                  <div className="max-h-40 overflow-y-auto space-y-1.5">
                    {auditLog.map((entry) => (
                      <div key={entry.id} className="text-xs text-muted-foreground flex flex-wrap gap-1">
                        <span className="text-foreground/80">
                          {entry.user?.name || entry.user?.email || "Sistema"}
                        </span>
                        <span>alterou</span>
                        <span className="font-medium text-foreground/90">{entry.field ?? entry.action}</span>
                        {entry.oldValue && (
                          <span>de <span className="line-through">{entry.oldValue}</span></span>
                        )}
                        {entry.newValue && (
                          <span>para <span className="font-medium">{entry.newValue}</span></span>
                        )}
                        <span className="text-muted-foreground/60">
                          — {new Date(entry.createdAt).toLocaleString("pt-BR")}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>,
        document.body,
      )}
    </motion.div>
  );
}
