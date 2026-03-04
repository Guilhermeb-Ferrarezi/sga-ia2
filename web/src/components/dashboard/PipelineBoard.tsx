import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bot,
  BotOff,
  Check,
  Edit2,
  Eye,
  GripVertical,
  MessageCircle,
  Plus,
  RefreshCcw,
  Save,
  UserRoundCheck,
  UserRoundX,
  Trash2,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { useWebSocket, type WsEventPayload } from "@/contexts/WebSocketContext";
import {
  api,
  type ContactUpdateInput,
  type PipelineBoard,
  type PipelineContact,
  type PipelineStage,
  type Tag,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import TagBadge from "@/components/dashboard/TagBadge";

type LeadStatus = "open" | "won" | "lost";

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

const findContactInBoard = (
  board: PipelineBoard,
  waId: string,
): PipelineContact | null => {
  const inUnassigned = board.unassigned.find((contact) => contact.waId === waId);
  if (inUnassigned) return inUnassigned;

  for (const stage of board.stages) {
    const found = stage.contacts.find((contact) => contact.waId === waId);
    if (found) return found;
  }

  return null;
};

type ContextMenuState = {
  x: number;
  y: number;
  contact: PipelineContact;
};

type StageFormState = {
  id: number | null;
  name: string;
  color: string;
  isActive: boolean;
};

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

export default function PipelineBoardView() {
  const navigate = useNavigate();
  const { token, logout } = useAuth();
  const { toast } = useToast();
  const { subscribe } = useWebSocket();
  const [board, setBoard] = useState<PipelineBoard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragData, setDragData] = useState<{
    waId: string;
    fromStageId: number | null;
  } | null>(null);
  const [dragStageId, setDragStageId] = useState<number | null>(null);
  const [leadDropTargetKey, setLeadDropTargetKey] = useState<string | null>(null);
  const [movedLeadWaId, setMovedLeadWaId] = useState<string | null>(null);
  const [stageForm, setStageForm] = useState<StageFormState | null>(null);
  const [savingStage, setSavingStage] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [detailsContact, setDetailsContact] = useState<PipelineContact | null>(null);
  const [detailsForm, setDetailsForm] = useState<DetailsFormState | null>(null);
  const [detailsTagId, setDetailsTagId] = useState<string>("");
  const [savingDetails, setSavingDetails] = useState(false);
  const [tagsCatalog, setTagsCatalog] = useState<Tag[]>([]);
  const [processingWaId, setProcessingWaId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | LeadStatus>("all");
  const [handoffFilter, setHandoffFilter] = useState<"all" | "yes" | "no">("all");
  const [botFilter, setBotFilter] = useState<"all" | "on" | "off">("all");
  const [triageFilter, setTriageFilter] = useState<"all" | "done" | "pending">("all");
  const [columnPage, setColumnPage] = useState<Record<string, number>>({});

  const PAGE_SIZE = 10;

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [boardData, tagData] = await Promise.all([
        api.pipelineBoard(token),
        api.tags(token, { limit: 200, offset: 0 }),
      ]);
      setBoard(boardData);
      setTagsCatalog(tagData.items);
    } catch (err: unknown) {
      if (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 401) {
        logout();
        return;
      }
      setError(err instanceof Error ? err.message : "Falha ao carregar pipeline.");
    } finally {
      setLoading(false);
    }
  }, [token, logout]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return subscribe((event: WsEventPayload) => {
      if (
        event.type === "contact:updated" ||
        event.type === "contact:deleted" ||
        event.type === "pipeline:updated"
      ) {
        void load();
      }
    });
  }, [subscribe, load]);

  useEffect(() => {
    if (!contextMenu) return;

    const close = () => setContextMenu(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };

    window.addEventListener("click", close);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!board || !detailsContact) return;
    const refreshed = findContactInBoard(board, detailsContact.waId);
    if (!refreshed) {
      setDetailsContact(null);
      return;
    }
    setDetailsContact(refreshed);
  }, [board, detailsContact]);

  useEffect(() => {
    if (!detailsContact) {
      setDetailsForm(null);
      setDetailsTagId("");
      return;
    }
    setDetailsForm(buildDetailsForm(detailsContact));
    setDetailsTagId("");
  }, [detailsContact?.waId]);

  useEffect(() => {
    setColumnPage({});
  }, [searchTerm, statusFilter, handoffFilter, botFilter, triageFilter]);

  const availableTagsForDetails = useMemo(() => {
    if (!detailsContact) return [];
    const assigned = new Set(detailsContact.tags.map((ct) => ct.tag.id));
    return tagsCatalog.filter((tag) => !assigned.has(tag.id));
  }, [detailsContact, tagsCatalog]);

  const handleDragStart = (waId: string, stageId: number | null) => {
    setDragData({ waId, fromStageId: stageId });
  };

  const handleStageDragStart = (stageId: number) => {
    setDragStageId(stageId);
  };

  const handleStageDrop = async (targetStageId: number) => {
    if (!token || !board || !dragStageId || dragStageId === targetStageId) {
      setDragStageId(null);
      return;
    }

    const ordered = [...board.stages];
    const fromIndex = ordered.findIndex((stage) => stage.id === dragStageId);
    const toIndex = ordered.findIndex((stage) => stage.id === targetStageId);
    if (fromIndex === -1 || toIndex === -1) {
      setDragStageId(null);
      return;
    }

    const [moved] = ordered.splice(fromIndex, 1);
    ordered.splice(toIndex, 0, moved);

    try {
      await api.reorderPipelineStages(token, ordered.map((stage) => stage.id));
      toast({ title: "Etapas reorganizadas", variant: "success" });
      await load();
    } catch (err: unknown) {
      toast({
        title: "Falha ao reorganizar etapas",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "error",
      });
    } finally {
      setDragStageId(null);
    }
  };

  const handleDrop = async (targetStageId: number | null) => {
    if (!dragData || !token) return;
    if (dragData.fromStageId === targetStageId) {
      setDragData(null);
      setLeadDropTargetKey(null);
      return;
    }

    setLeadDropTargetKey(String(targetStageId ?? "unassigned"));

    try {
      await api.updateContactStage(token, dragData.waId, targetStageId);
      toast({ title: "Lead movido com sucesso", variant: "success" });
      setMovedLeadWaId(dragData.waId);
      await load();
    } catch (err: unknown) {
      toast({
        title: "Falha ao mover lead",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "error",
      });
    } finally {
      setDragData(null);
      setLeadDropTargetKey(null);
      setTimeout(() => setMovedLeadWaId(null), 1200);
    }
  };

  const openCreateStageForm = () => {
    setStageForm({
      id: null,
      name: "",
      color: "#06b6d4",
      isActive: true,
    });
  };

  const openEditStageForm = (stage: PipelineStage) => {
    setStageForm({
      id: stage.id,
      name: stage.name,
      color: stage.color,
      isActive: stage.isActive,
    });
  };

  const saveStage = async () => {
    if (!token || !stageForm || !stageForm.name.trim()) return;

    setSavingStage(true);
    try {
      if (stageForm.id) {
        await api.updatePipelineStage(token, stageForm.id, {
          name: stageForm.name.trim(),
          color: stageForm.color,
          isActive: stageForm.isActive,
        });
        toast({ title: "Etapa atualizada", variant: "success" });
      } else {
        await api.createPipelineStage(token, {
          name: stageForm.name.trim(),
          color: stageForm.color,
          isActive: stageForm.isActive,
        });
        toast({ title: "Etapa criada", variant: "success" });
      }

      setStageForm(null);
      await load();
    } catch (err: unknown) {
      toast({
        title: "Falha ao salvar etapa",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "error",
      });
    } finally {
      setSavingStage(false);
    }
  };

  const deleteStage = async (stage: PipelineStage) => {
    if (!token) return;
    const confirmed = window.confirm(
      `Excluir etapa "${stage.name}"? Leads vinculados voltam para "Sem Estagio".`,
    );
    if (!confirmed) return;

    setSavingStage(true);
    try {
      await api.deletePipelineStage(token, stage.id);
      toast({ title: "Etapa excluida", variant: "success" });
      await load();
    } catch (err: unknown) {
      toast({
        title: "Falha ao excluir etapa",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "error",
      });
    } finally {
      setSavingStage(false);
    }
  };

  const openChat = (waId: string) => {
    navigate(`/dashboard/conversations?phone=${encodeURIComponent(waId)}`);
    setContextMenu(null);
    setDetailsContact(null);
  };

  const toggleBot = async (contact: PipelineContact) => {
    if (!token) return;
    setProcessingWaId(contact.waId);
    try {
      await api.toggleBot(token, contact.waId, !contact.botEnabled);
      toast({
        title: contact.botEnabled ? "Bot desativado" : "Bot ativado",
        description: `${contact.name || contact.waId}`,
        variant: "success",
      });
      await load();
    } catch (err: unknown) {
      toast({
        title: "Falha ao atualizar bot",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "error",
      });
    } finally {
      setProcessingWaId(null);
      setContextMenu(null);
    }
  };

  const updateLeadStatus = async (contact: PipelineContact, status: LeadStatus) => {
    if (!token) return;
    setProcessingWaId(contact.waId);
    try {
      await api.updateContactLeadStatus(token, contact.waId, status);
      toast({
        title: "Status atualizado",
        description: `${contact.name || contact.waId}: ${leadStatusMeta[status].label}`,
        variant: "success",
      });
      await load();
    } catch (err: unknown) {
      toast({
        title: "Falha ao atualizar status",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "error",
      });
    } finally {
      setProcessingWaId(null);
      setContextMenu(null);
    }
  };

  const moveLeadToStage = async (contact: PipelineContact, stageId: number | null) => {
    if (!token) return;
    setProcessingWaId(contact.waId);
    try {
      await api.updateContactStage(token, contact.waId, stageId);
      toast({ title: "Lead movido", variant: "success" });
      await load();
    } catch (err: unknown) {
      toast({
        title: "Falha ao mover lead",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "error",
      });
    } finally {
      setProcessingWaId(null);
      setContextMenu(null);
    }
  };

  const deleteLead = async (contact: PipelineContact) => {
    if (!token) return;
    const confirmed = window.confirm(
      `Excluir o lead "${contact.name || contact.waId}"? Esta acao remove mensagens e historico.`,
    );
    if (!confirmed) return;

    setProcessingWaId(contact.waId);
    try {
      await api.deleteContact(token, contact.waId);
      toast({ title: "Lead excluido", variant: "success" });
      setDetailsContact((current) => (current?.waId === contact.waId ? null : current));
      await load();
    } catch (err: unknown) {
      toast({
        title: "Falha ao excluir lead",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "error",
      });
    } finally {
      setProcessingWaId(null);
      setContextMenu(null);
    }
  };

  const upsertDetailsContact = (updated: PipelineContact) => {
    setDetailsContact(updated);
    setDetailsForm(buildDetailsForm(updated));
  };

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

    const payload: ContactUpdateInput = {
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
      handoffReason: toNullableText(detailsForm.handoffReason),
      handoffRequested: detailsForm.handoffRequested,
      triageCompleted: detailsForm.triageCompleted,
      botEnabled: detailsForm.botEnabled,
    };

    if (!detailsForm.handoffRequested) {
      payload.handoffAt = null;
      payload.handoffReason = null;
    }

    setSavingDetails(true);
    try {
      const updated = await api.updateContact(token, detailsContact.waId, payload);
      upsertDetailsContact(updated);
      toast({ title: "Contato atualizado", variant: "success" });
      await load();
    } catch (err: unknown) {
      toast({
        title: "Falha ao salvar detalhes",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "error",
      });
    } finally {
      setSavingDetails(false);
    }
  };

  const setManualHandoff = async (contact: PipelineContact, enabled: boolean) => {
    if (!token) return;

    setProcessingWaId(contact.waId);
    try {
      const updated = await api.updateContact(token, contact.waId, {
        handoffRequested: enabled,
        handoffReason: enabled
          ? "Encaminhamento manual solicitado no painel"
          : null,
        handoffAt: enabled ? new Date().toISOString() : null,
        botEnabled: !enabled,
      });
      upsertDetailsContact(updated);
      toast({
        title: enabled ? "Encaminhado para humano" : "Bot retomado",
        description: contact.name || contact.waId,
        variant: "success",
      });
      await load();
    } catch (err: unknown) {
      toast({
        title: "Falha ao atualizar encaminhamento",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "error",
      });
    } finally {
      setProcessingWaId(null);
      setContextMenu(null);
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
      toast({ title: "Tag adicionada", variant: "success" });
      await load();
    } catch (err: unknown) {
      toast({
        title: "Falha ao adicionar tag",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "error",
      });
    } finally {
      setSavingDetails(false);
    }
  };

  const removeTagFromDetails = async (tagId: number) => {
    if (!token || !detailsContact) return;

    setSavingDetails(true);
    try {
      await api.removeContactTag(token, detailsContact.waId, tagId);
      toast({ title: "Tag removida", variant: "success" });
      await load();
    } catch (err: unknown) {
      toast({
        title: "Falha ao remover tag",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "error",
      });
    } finally {
      setSavingDetails(false);
    }
  };

  const applyContactFilters = (contacts: PipelineContact[]): PipelineContact[] => {
    return contacts.filter((contact) => {
      const normalizedStatus = normalizeLeadStatus(contact.leadStatus);
      if (statusFilter !== "all" && normalizedStatus !== statusFilter) return false;

      if (handoffFilter === "yes" && !contact.handoffRequested) return false;
      if (handoffFilter === "no" && contact.handoffRequested) return false;

      if (botFilter === "on" && !contact.botEnabled) return false;
      if (botFilter === "off" && contact.botEnabled) return false;

      if (triageFilter === "done" && !contact.triageCompleted) return false;
      if (triageFilter === "pending" && contact.triageCompleted) return false;

      const search = searchTerm.trim().toLowerCase();
      if (!search) return true;

      const haystack = [
        contact.name,
        contact.waId,
        contact.email,
        contact.tournament,
        contact.city,
        contact.category,
        contact.teamName,
        contact.messages[0]?.body,
      ]
        .filter((value): value is string => Boolean(value))
        .join(" ")
        .toLowerCase();

      return haystack.includes(search);
    });
  };

  const paginateContacts = (stageKey: string, contacts: PipelineContact[]) => {
    const totalPages = Math.max(1, Math.ceil(contacts.length / PAGE_SIZE));
    const currentPage = Math.min(columnPage[stageKey] ?? 1, totalPages);
    const start = (currentPage - 1) * PAGE_SIZE;
    const items = contacts.slice(start, start + PAGE_SIZE);
    return { items, totalPages, currentPage };
  };

  const renderContactCard = (contact: PipelineContact, stageId: number | null) => {
    const status = normalizeLeadStatus(contact.leadStatus);

    return (
      <div
        key={contact.waId}
        draggable
        onDragStart={() => handleDragStart(contact.waId, stageId)}
        onContextMenu={(event) => {
          event.preventDefault();
          setContextMenu({
            x: event.clientX,
            y: event.clientY,
            contact,
          });
        }}
        className="cursor-grab rounded-lg border border-border bg-background/60 p-3 transition hover:border-primary/40 active:cursor-grabbing"
        title="Clique com o botao direito para abrir o menu de acoes"
      >
        <div className="flex items-start gap-2">
          <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-medium">
                {contact.name || contact.waId}
              </p>
              {movedLeadWaId === contact.waId && (
                <Badge variant="secondary" className="h-5 animate-pulse px-2 text-[10px]">
                  Movido
                </Badge>
              )}
              <Badge
                variant="outline"
                className={cn("h-5 px-2 text-[10px]", leadStatusMeta[status].badgeClass)}
              >
                {leadStatusMeta[status].label}
              </Badge>
            </div>
            {contact.name && (
              <p className="text-xs text-muted-foreground">{contact.waId}</p>
            )}
            {contact.messages[0] && (
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {contact.messages[0].body.slice(0, 80)}
              </p>
            )}
            {contact.tags.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {contact.tags.map((ct) => (
                  <TagBadge
                    key={ct.tag.id}
                    name={ct.tag.name}
                    color={ct.tag.color}
                  />
                ))}
              </div>
            )}
            <p className="mt-1 text-[10px] text-muted-foreground">
              {formatDate(contact.lastInteractionAt)}
            </p>
          </div>
        </div>
      </div>
    );
  };

  const renderColumn = (
    title: string,
    color: string,
    stageId: number | null,
    contacts: PipelineContact[],
  ) => {
    const stageKey = String(stageId ?? "unassigned");
    const filteredContacts = applyContactFilters(contacts);
    const { items, totalPages, currentPage } = paginateContacts(
      stageKey,
      filteredContacts,
    );

    return (
    <div
      key={stageId ?? "unassigned"}
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-xl border border-border/60 bg-card/50 transition",
        leadDropTargetKey === stageKey && "border-primary shadow-[0_0_0_2px_hsl(var(--primary)/0.35)]",
      )}
      onDragOver={(e) => e.preventDefault()}
      onDrop={() => void handleDrop(stageId)}
    >
      <div
        className="flex items-center gap-2 rounded-t-xl px-3 py-2.5"
        style={{ borderBottom: `3px solid ${color}` }}
      >
        <span
          className="h-3 w-3 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="text-sm font-semibold">{title}</span>
        <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs">
          {filteredContacts.length}
        </span>
      </div>
      <ScrollArea className="flex-1 p-2" style={{ maxHeight: "calc(100vh - 260px)" }}>
        <div className="space-y-2">
          {items.map((c) => renderContactCard(c, stageId))}
          {!items.length && (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              Nenhum contato
            </p>
          )}
        </div>
      </ScrollArea>
      <div className="flex items-center justify-between border-t border-border/60 px-2 py-1.5 text-[11px] text-muted-foreground">
        <span>Pagina {currentPage}/{totalPages}</span>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[11px]"
            disabled={currentPage <= 1}
            onClick={() =>
              setColumnPage((prev) => ({
                ...prev,
                [stageKey]: Math.max(1, (prev[stageKey] ?? 1) - 1),
              }))
            }
          >
            Prev
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[11px]"
            disabled={currentPage >= totalPages}
            onClick={() =>
              setColumnPage((prev) => ({
                ...prev,
                [stageKey]: Math.min(totalPages, (prev[stageKey] ?? 1) + 1),
              }))
            }
          >
            Prox
          </Button>
        </div>
      </div>
    </div>
  );
  };

  const contextMenuPosition = useMemo(() => {
    if (!contextMenu) return null;
    const width = 320;
    const height = 430;
    const maxLeft = window.innerWidth - width - 12;
    const maxTop = window.innerHeight - height - 12;
    return {
      left: Math.max(12, Math.min(contextMenu.x, maxLeft)),
      top: Math.max(12, Math.min(contextMenu.y, maxTop)),
    };
  }, [contextMenu]);

  if (!board) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-muted-foreground">
          {loading ? "Carregando pipeline..." : "Pipeline vazio."}
        </p>
      </div>
    );
  }

  return (
    <div className="stagger space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold">Pipeline</h2>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={openCreateStageForm}
            disabled={savingStage}
          >
            <Plus className="h-4 w-4" />
            Nova Etapa
          </Button>
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
      </div>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Card className="border-border/70">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Organizar Etapas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            {board.stages.map((stage) => (
              <div
                key={stage.id}
                draggable
                onDragStart={() => handleStageDragStart(stage.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => void handleStageDrop(stage.id)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border border-border/70 bg-background/50 px-3 py-2 transition",
                  dragStageId === stage.id && "opacity-60",
                )}
              >
                <GripVertical className="h-4 w-4 text-muted-foreground/60" />
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                <span className="text-sm font-medium">{stage.name}</span>
                {!stage.isActive && (
                  <Badge variant="outline" className="h-5 px-2 text-[10px]">
                    Inativa
                  </Badge>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => openEditStageForm(stage)}
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => void deleteStage(stage)}
                  disabled={savingStage}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            ))}
            {!board.stages.length && (
              <p className="text-sm text-muted-foreground">
                Nenhuma etapa cadastrada.
              </p>
            )}
          </div>

          {stageForm && (
            <div className="anim-pop rounded-lg border border-primary/30 bg-primary/5 p-3">
              <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto] md:items-end">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Nome da etapa</label>
                  <Input
                    value={stageForm.name}
                    onChange={(e) =>
                      setStageForm((current) =>
                        current ? { ...current, name: e.target.value } : current,
                      )
                    }
                    placeholder="Ex: Qualificado"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Cor</label>
                  <input
                    type="color"
                    value={stageForm.color}
                    onChange={(e) =>
                      setStageForm((current) =>
                        current ? { ...current, color: e.target.value } : current,
                      )
                    }
                    className="h-10 w-14 cursor-pointer rounded-md border border-border bg-background"
                  />
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch
                    checked={stageForm.isActive}
                    onCheckedChange={(checked) =>
                      setStageForm((current) =>
                        current ? { ...current, isActive: checked } : current,
                      )
                    }
                  />
                  Ativa
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => void saveStage()}
                    disabled={savingStage || !stageForm.name.trim()}
                  >
                    <Save className="h-4 w-4" />
                    Salvar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setStageForm(null)}
                    disabled={savingStage}
                  >
                    <X className="h-4 w-4" />
                    Cancelar
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros do Pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar lead, telefone, cidade..."
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as "all" | LeadStatus)}
              className="h-11 rounded-lg border border-input bg-background px-3 text-sm"
            >
              <option value="all">Status: todos</option>
              <option value="open">Status: aberto</option>
              <option value="won">Status: ganho</option>
              <option value="lost">Status: perdido</option>
            </select>
            <select
              value={handoffFilter}
              onChange={(event) => setHandoffFilter(event.target.value as "all" | "yes" | "no")}
              className="h-11 rounded-lg border border-input bg-background px-3 text-sm"
            >
              <option value="all">Handoff: todos</option>
              <option value="yes">Handoff: sim</option>
              <option value="no">Handoff: nao</option>
            </select>
            <select
              value={botFilter}
              onChange={(event) => setBotFilter(event.target.value as "all" | "on" | "off")}
              className="h-11 rounded-lg border border-input bg-background px-3 text-sm"
            >
              <option value="all">Bot: todos</option>
              <option value="on">Bot: ligado</option>
              <option value="off">Bot: desligado</option>
            </select>
            <select
              value={triageFilter}
              onChange={(event) => setTriageFilter(event.target.value as "all" | "done" | "pending")}
              className="h-11 rounded-lg border border-input bg-background px-3 text-sm"
            >
              <option value="all">Triagem: todos</option>
              <option value="done">Triagem: concluida</option>
              <option value="pending">Triagem: pendente</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {renderColumn("Sem Estagio", "#6b7280", null, board.unassigned)}
        {board.stages.map((stage) =>
          renderColumn(stage.name, stage.color, stage.id, stage.contacts),
        )}
      </div>

      {contextMenu && contextMenuPosition && (
        <div className="fixed inset-0 z-50" onClick={() => setContextMenu(null)}>
          <Card
            className="absolute w-[320px] border-border/90 bg-card/95 shadow-2xl backdrop-blur-md"
            style={{
              left: contextMenuPosition.left,
              top: contextMenuPosition.top,
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {contextMenu.contact.name || contextMenu.contact.waId}
              </CardTitle>
              <p className="text-xs text-muted-foreground">{contextMenu.contact.waId}</p>
            </CardHeader>
            <CardContent className="space-y-2 p-3 pt-0">
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition hover:bg-muted/70"
                onClick={() => openChat(contextMenu.contact.waId)}
              >
                <MessageCircle className="h-4 w-4 text-muted-foreground" />
                Abrir chat
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition hover:bg-muted/70"
                onClick={() => {
                  setDetailsContact(contextMenu.contact);
                  setContextMenu(null);
                }}
              >
                <Eye className="h-4 w-4 text-muted-foreground" />
                Ver detalhes
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition hover:bg-muted/70"
                onClick={() => void toggleBot(contextMenu.contact)}
                disabled={processingWaId === contextMenu.contact.waId}
              >
                {contextMenu.contact.botEnabled ? (
                  <BotOff className="h-4 w-4 text-amber-300" />
                ) : (
                  <Bot className="h-4 w-4 text-emerald-300" />
                )}
                {contextMenu.contact.botEnabled ? "Desativar bot" : "Ativar bot"}
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition hover:bg-muted/70"
                onClick={() =>
                  void setManualHandoff(
                    contextMenu.contact,
                    !contextMenu.contact.handoffRequested,
                  )
                }
                disabled={processingWaId === contextMenu.contact.waId}
              >
                {contextMenu.contact.handoffRequested ? (
                  <UserRoundCheck className="h-4 w-4 text-emerald-300" />
                ) : (
                  <UserRoundX className="h-4 w-4 text-amber-300" />
                )}
                {contextMenu.contact.handoffRequested
                  ? "Retomar bot"
                  : "Encaminhar para humano"}
              </button>

              <Separator className="my-1" />

              <p className="px-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Status
              </p>
              {(["open", "won", "lost"] as LeadStatus[]).map((status) => {
                const active = normalizeLeadStatus(contextMenu.contact.leadStatus) === status;
                return (
                  <button
                    key={status}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition hover:bg-muted/70"
                    onClick={() => void updateLeadStatus(contextMenu.contact, status)}
                    disabled={processingWaId === contextMenu.contact.waId}
                  >
                    <span
                      className={cn(
                        "h-2.5 w-2.5 rounded-full",
                        status === "open" && "bg-cyan-400",
                        status === "won" && "bg-emerald-400",
                        status === "lost" && "bg-rose-400",
                      )}
                    />
                    <span>{leadStatusMeta[status].label}</span>
                    {active && <Check className="ml-auto h-4 w-4 text-primary" />}
                  </button>
                );
              })}

              <Separator className="my-1" />

              <p className="px-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Mover para etapa
              </p>
              <button
                type="button"
                className="flex w-full items-center rounded-md px-2 py-2 text-left text-sm transition hover:bg-muted/70"
                onClick={() => void moveLeadToStage(contextMenu.contact, null)}
                disabled={processingWaId === contextMenu.contact.waId}
              >
                Sem Estagio
              </button>
              {board.stages.map((stage) => (
                <button
                  key={stage.id}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition hover:bg-muted/70"
                  onClick={() => void moveLeadToStage(contextMenu.contact, stage.id)}
                  disabled={processingWaId === contextMenu.contact.waId}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: stage.color }}
                  />
                  {stage.name}
                </button>
              ))}

              <Separator className="my-1" />

              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-destructive transition hover:bg-destructive/10"
                onClick={() => void deleteLead(contextMenu.contact)}
                disabled={processingWaId === contextMenu.contact.waId}
              >
                <Trash2 className="h-4 w-4" />
                Excluir lead
              </button>
            </CardContent>
          </Card>
        </div>
      )}

      {detailsContact && detailsForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/65 p-4 backdrop-blur-sm"
          onClick={() => setDetailsContact(null)}
        >
          <Card
            className="anim-pop w-full max-w-3xl border-border/90"
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
            <CardContent className="space-y-3">
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

              <div className="rounded-lg border border-border/70 bg-background/40 p-3">
                <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  Acoes rapidas
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => openChat(detailsContact.waId)}
                  >
                    <MessageCircle className="h-4 w-4" />
                    Abrir chat
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      updateDetailsField("botEnabled", !detailsForm.botEnabled)
                    }
                  >
                    {detailsForm.botEnabled ? (
                      <BotOff className="h-4 w-4" />
                    ) : (
                      <Bot className="h-4 w-4" />
                    )}
                    {detailsForm.botEnabled ? "Desativar bot" : "Ativar bot"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void setManualHandoff(
                        detailsContact,
                        !detailsContact.handoffRequested,
                      )
                    }
                    disabled={processingWaId === detailsContact.waId}
                  >
                    {detailsContact.handoffRequested ? (
                      <UserRoundCheck className="h-4 w-4" />
                    ) : (
                      <UserRoundX className="h-4 w-4" />
                    )}
                    {detailsContact.handoffRequested
                      ? "Retomar bot"
                      : "Encaminhar para humano"}
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border border-border/70 bg-background/40 p-3">
                <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  Dados de triagem
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Nome</label>
                    <Input
                      value={detailsForm.name}
                      onChange={(event) => updateDetailsField("name", event.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Email</label>
                    <Input
                      value={detailsForm.email}
                      onChange={(event) => updateDetailsField("email", event.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Campeonato</label>
                    <Input
                      value={detailsForm.tournament}
                      onChange={(event) =>
                        updateDetailsField("tournament", event.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Data</label>
                    <Input
                      value={detailsForm.eventDate}
                      onChange={(event) => updateDetailsField("eventDate", event.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Categoria</label>
                    <Input
                      value={detailsForm.category}
                      onChange={(event) => updateDetailsField("category", event.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Cidade</label>
                    <Input
                      value={detailsForm.city}
                      onChange={(event) => updateDetailsField("city", event.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Time</label>
                    <Input
                      value={detailsForm.teamName}
                      onChange={(event) => updateDetailsField("teamName", event.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Jogadores</label>
                    <Input
                      inputMode="numeric"
                      value={detailsForm.playersCount}
                      onChange={(event) =>
                        updateDetailsField("playersCount", event.target.value)
                      }
                    />
                  </div>
                </div>
                <div className="mt-2">
                  <Checkbox
                    checked={detailsForm.triageCompleted}
                    onCheckedChange={(checked) =>
                      updateDetailsField("triageCompleted", checked)
                    }
                    label="Triagem concluida"
                    className="text-xs text-muted-foreground"
                  />
                </div>
              </div>

              <div className="rounded-lg border border-border/70 bg-background/40 p-3">
                <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  Encaminhamento humano
                </p>
                <div className="mt-2 space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={detailsForm.handoffRequested}
                      onCheckedChange={(checked) =>
                        updateDetailsField("handoffRequested", checked)
                      }
                    />
                    Solicitar atendimento humano
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Motivo</label>
                    <Input
                      value={detailsForm.handoffReason}
                      onChange={(event) =>
                        updateDetailsField("handoffReason", event.target.value)
                      }
                      disabled={!detailsForm.handoffRequested}
                      placeholder="Ex: cliente pediu atendimento humano"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Ultima solicitacao:{" "}
                    {detailsContact.handoffAt
                      ? formatDate(detailsContact.handoffAt)
                      : "-"}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-border/70 bg-background/40 p-3">
                <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  Tags
                </p>
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
                <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  Observacoes
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Origem</label>
                    <Input
                      value={detailsForm.source}
                      onChange={(event) => updateDetailsField("source", event.target.value)}
                    />
                  </div>
                </div>
                <div className="mt-2 space-y-1">
                  <label className="text-xs text-muted-foreground">Notas</label>
                  <textarea
                    value={detailsForm.notes}
                    onChange={(event) => updateDetailsField("notes", event.target.value)}
                    rows={3}
                    className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
              </div>

              {detailsContact.messages[0] && (
                <div className="rounded-lg border border-border/70 bg-background/40 p-3">
                  <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                    Ultima mensagem
                  </p>
                  <p className="mt-1 text-sm text-foreground/90">
                    {detailsContact.messages[0].body}
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setDetailsContact(null)}
                  disabled={savingDetails}
                >
                  Fechar
                </Button>
                <Button onClick={() => void saveDetails()} disabled={savingDetails}>
                  <Save className="h-4 w-4" />
                  Salvar dados
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
