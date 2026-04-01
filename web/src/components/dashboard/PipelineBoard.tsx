import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
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
import { useRetry } from "@/hooks/useRetry";
import { useSavedFilters } from "@/hooks/useSavedFilters";
import { useWebSocket } from "@/contexts/WebSocketContext";
import {
  api,
  type ContactUpdateInput,
  type PipelineBoard,
  type PipelineContact,
  type PipelineStage,
  type Tag,
} from "@/lib/api";
import { PERMISSIONS, hasAnyPermission } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  LeadOriginBadge,
  getLeadOriginHint,
  getLeadOriginMeta,
  resolveLeadOriginChannel,
  type LeadOriginChannel,
} from "@/components/dashboard/LeadOriginBadge";
import TagBadge from "@/components/dashboard/TagBadge";

type LeadStatus = "open" | "won" | "lost";
type ChannelFilter = "all" | LeadOriginChannel;
type ColumnKey = "unassigned" | `stage:${number}`;
type ColumnPaginationState = {
  page: number;
  limit: number;
  offset: number;
  total: number;
};

const PIPELINE_PAGE_SIZE = 20;

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

const statusFilterLabel: Record<"all" | LeadStatus, string> = {
  all: "todos",
  open: "aberto",
  won: "ganho",
  lost: "perdido",
};

const handoffFilterLabel: Record<"all" | "yes" | "no", string> = {
  all: "todos",
  yes: "sim",
  no: "nao",
};

const botFilterLabel: Record<"all" | "on" | "off", string> = {
  all: "todos",
  on: "ligado",
  off: "desligado",
};

const triageFilterLabel: Record<"all" | "done" | "pending", string> = {
  all: "todos",
  done: "concluida",
  pending: "pendente",
};

const channelFilterLabel: Record<ChannelFilter, string> = {
  all: "todos",
  WHATSAPP: "WhatsApp",
  INSTAGRAM: "Instagram",
};

const colorPresets = [
  "#06b6d4",
  "#22c55e",
  "#3b82f6",
  "#eab308",
  "#f97316",
  "#ef4444",
  "#a855f7",
  "#6b7280",
];

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

const getColumnKey = (stageId: number | null): ColumnKey =>
  stageId === null ? "unassigned" : `stage:${stageId}`;

const getColumnPageNumber = (offset: number, limit: number): number =>
  Math.floor(offset / Math.max(1, limit)) + 1;

const buildColumnPaginationState = (
  column: Pick<PipelineBoard["unassigned"], "total" | "limit" | "offset">,
): ColumnPaginationState => ({
  page: getColumnPageNumber(column.offset, column.limit),
  limit: column.limit,
  offset: column.offset,
  total: column.total,
});

const clonePipelineColumn = (column: PipelineBoard["unassigned"]): PipelineBoard["unassigned"] => ({
  ...column,
  items: [...column.items],
});

const findContactInBoard = (
  board: PipelineBoard,
  waId: string,
): PipelineContact | null => {
  const inUnassigned = board.unassigned.items.find((contact) => contact.waId === waId);
  if (inUnassigned) return inUnassigned;

  for (const stage of board.stages) {
    const found = stage.items.find((contact) => contact.waId === waId);
    if (found) return found;
  }

  return null;
};

const moveContactInBoard = (
  board: PipelineBoard,
  waId: string,
  targetStageId: number | null,
): PipelineBoard => {
  const nextStages = board.stages.map((stage) => ({
    ...stage,
    items: [...stage.items],
  }));
  let nextUnassigned = clonePipelineColumn(board.unassigned);
  let sourceStageId: number | null = null;
  let contactToMove: PipelineContact | null = null;

  const unassignedIndex = nextUnassigned.items.findIndex((contact) => contact.waId === waId);
  if (unassignedIndex >= 0) {
    sourceStageId = null;
    [contactToMove] = nextUnassigned.items.splice(unassignedIndex, 1);
    nextUnassigned.total = Math.max(0, nextUnassigned.total - 1);
  } else {
    for (const stage of nextStages) {
      const contactIndex = stage.items.findIndex((contact) => contact.waId === waId);
      if (contactIndex < 0) continue;
      sourceStageId = stage.id;
      [contactToMove] = stage.items.splice(contactIndex, 1);
      stage.total = Math.max(0, stage.total - 1);
      break;
    }
  }

  if (!contactToMove || sourceStageId === targetStageId) {
    return board;
  }

  const movedContact: PipelineContact = {
    ...contactToMove,
    stageId: targetStageId,
  };

  if (targetStageId === null) {
    nextUnassigned.total += 1;
    if (nextUnassigned.offset === 0) {
      nextUnassigned.items = [movedContact, ...nextUnassigned.items].slice(0, nextUnassigned.limit);
    }
    return {
      ...board,
      unassigned: nextUnassigned,
      stages: nextStages,
    };
  }

  const targetStage = nextStages.find((stage) => stage.id === targetStageId);
  if (!targetStage) return board;

  targetStage.total += 1;
  if (targetStage.offset === 0) {
    targetStage.items = [movedContact, ...targetStage.items].slice(0, targetStage.limit);
  }

  return {
    ...board,
    unassigned: nextUnassigned,
    stages: nextStages,
  };
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

type ManualLeadFormState = {
  waId: string;
  name: string;
  stageId: string;
  email: string;
  tournament: string;
  category: string;
  city: string;
  teamName: string;
  playersCount: string;
};

const buildManualLeadForm = (): ManualLeadFormState => ({
  waId: "",
  name: "",
  stageId: "",
  email: "",
  tournament: "",
  category: "",
  city: "",
  teamName: "",
  playersCount: "",
});

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

type VirtualizedContactListProps = {
  contacts: PipelineContact[];
  stageId: number | null;
  scrollKey: string;
  renderContactCard: (contact: PipelineContact, stageId: number | null) => JSX.Element;
};

function VirtualizedContactList({
  contacts,
  stageId,
  scrollKey,
  renderContactCard,
}: VirtualizedContactListProps) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: contacts.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 172,
    measureElement: (element) => element?.getBoundingClientRect().height ?? 0,
    overscan: 8,
  });

  useEffect(() => {
    parentRef.current?.scrollTo({ top: 0 });
  }, [scrollKey]);

  if (!contacts.length) {
    return (
      <p className="px-2 py-4 text-center text-xs text-muted-foreground">
        Nenhum contato
      </p>
    );
  }

  return (
    <div ref={parentRef} className="h-full min-h-0 overflow-y-auto p-2">
      <div className="relative" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const contact = contacts[virtualRow.index];
          if (!contact) return null;
          return (
            <div
              key={contact.waId}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              className="absolute left-0 top-0 w-full"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              {renderContactCard(contact, stageId)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function PipelineBoardView() {
  const navigate = useNavigate();
  const { token, logout, user } = useAuth();
  const { toast } = useToast();
  const { run: retryRun } = useRetry();
  const { subscribeFiltered } = useWebSocket();
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
  const [movingLeadWaId, setMovingLeadWaId] = useState<string | null>(null);
  const [stageForm, setStageForm] = useState<StageFormState | null>(null);
  const [savingStage, setSavingStage] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [detailsContact, setDetailsContact] = useState<PipelineContact | null>(null);
  const [detailsForm, setDetailsForm] = useState<DetailsFormState | null>(null);
  const [detailsTagId, setDetailsTagId] = useState<string>("");
  const [savingDetails, setSavingDetails] = useState(false);
  const [tagsCatalog, setTagsCatalog] = useState<Tag[]>([]);
  const [processingWaId, setProcessingWaId] = useState<string | null>(null);

  const pipelineFilterDefaults = {
    searchTerm: "" as string,
    statusFilter: "all" as "all" | LeadStatus,
    handoffFilter: "all" as "all" | "yes" | "no",
    botFilter: "all" as "all" | "on" | "off",
    triageFilter: "all" as "all" | "done" | "pending",
    channelFilter: "all" as ChannelFilter,
  };
  const [pFilters, setPFilter] = useSavedFilters("pipeline", pipelineFilterDefaults);
  const {
    searchTerm,
    statusFilter,
    handoffFilter,
    botFilter,
    triageFilter,
    channelFilter,
  } = pFilters;

  const [deletingStageId, setDeletingStageId] = useState<number | null>(null);
  const [deletingLeadWaId, setDeletingLeadWaId] = useState<string | null>(null);
  const [inlineStageTitle, setInlineStageTitle] = useState<{ id: number; name: string } | null>(
    null,
  );
  const [savingInlineStageTitle, setSavingInlineStageTitle] = useState(false);
  const [manualLeadForm, setManualLeadForm] = useState<ManualLeadFormState | null>(null);
  const [savingManualLead, setSavingManualLead] = useState(false);
  const canManageLeads = hasAnyPermission(user, [
    PERMISSIONS.LEADS_MANAGE_STATUS,
    PERMISSIONS.LEADS_MANAGE_STAGE,
    PERMISSIONS.LEADS_DELETE,
    PERMISSIONS.PIPELINE_MANAGE,
  ]);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const [contextMenuMeasuredHeight, setContextMenuMeasuredHeight] = useState<number | null>(
    null,
  );

  const ROW_HEIGHT_ESTIMATE = 96;
  const COLUMN_BASE_HEIGHT = 150;
  const COLUMN_MIN_HEIGHT = 260;
  const COLUMN_MAX_HEIGHT = 620;

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
    return subscribeFiltered(
      () => { void load(); },
      { types: ["contact:updated", "contact:deleted", "pipeline:updated"] },
    );
  }, [subscribeFiltered, load]);

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

  useLayoutEffect(() => {
    if (!contextMenu) {
      setContextMenuMeasuredHeight(null);
      return;
    }

    const measure = () => {
      const nextHeight = contextMenuRef.current?.getBoundingClientRect().height;
      if (!nextHeight) return;
      setContextMenuMeasuredHeight((prev) =>
        prev !== null && Math.abs(prev - nextHeight) < 1 ? prev : nextHeight,
      );
    };

    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [contextMenu, board?.stages.length]);

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

  const persistLeadStageMove = useCallback(
    async (waId: string, targetStageId: number | null, successTitle: string) => {
      if (!token) return false;

      let previousBoard: PipelineBoard | null = null;
      let appliedOptimisticMove = false;

      setBoard((current) => {
        if (!current) return current;
        const next = moveContactInBoard(current, waId, targetStageId);
        if (next === current) return current;
        previousBoard = current;
        appliedOptimisticMove = true;
        return next;
      });

      setProcessingWaId(waId);
      setMovingLeadWaId(waId);
      setMovedLeadWaId(waId);

      try {
        await api.updateContactStage(token, waId, targetStageId);
        toast({ title: successTitle, variant: "success" });
        void load();
        return true;
      } catch (err: unknown) {
        if (appliedOptimisticMove && previousBoard) {
          setBoard(previousBoard);
        }
        setMovedLeadWaId(null);
        toast({
          title: "Falha ao mover lead",
          description: err instanceof Error ? err.message : "Tente novamente.",
          variant: "error",
        });
        return false;
      } finally {
        setProcessingWaId((current) => (current === waId ? null : current));
        setMovingLeadWaId((current) => (current === waId ? null : current));
        setTimeout(() => {
          setMovedLeadWaId((current) => (current === waId ? null : current));
        }, 1200);
      }
    },
    [token, toast, load],
  );

  const handleDrop = async (targetStageId: number | null) => {
    if (!dragData || !token) return;
    if (!canManageLeads) {
      toast({ title: "Sem permissão para mover lead", variant: "error" });
      setDragData(null);
      setLeadDropTargetKey(null);
      return;
    }
    if (dragData.fromStageId === targetStageId) {
      setDragData(null);
      setLeadDropTargetKey(null);
      return;
    }

    setLeadDropTargetKey(String(targetStageId ?? "unassigned"));

    try {
      await persistLeadStageMove(dragData.waId, targetStageId, "Lead movido com sucesso");
    } finally {
      setDragData(null);
      setLeadDropTargetKey(null);
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

  const openManualLeadCreate = () => {
    setManualLeadForm(buildManualLeadForm());
  };

  const startInlineStageTitleEdit = (stage: PipelineStage) => {
    setInlineStageTitle({
      id: stage.id,
      name: stage.name,
    });
  };

  const cancelInlineStageTitleEdit = () => {
    setInlineStageTitle(null);
  };

  const saveInlineStageTitle = async () => {
    if (!token || !inlineStageTitle) return;
    const normalizedName = inlineStageTitle.name.trim();
    if (!normalizedName) {
      toast({
        title: "Titulo da etapa invalido",
        description: "Informe um nome para a etapa.",
        variant: "error",
      });
      return;
    }

    setSavingInlineStageTitle(true);
    try {
      await api.updatePipelineStage(token, inlineStageTitle.id, {
        name: normalizedName,
      });
      toast({ title: "Titulo da etapa atualizado", variant: "success" });
      setInlineStageTitle(null);
      await load();
    } catch (err: unknown) {
      toast({
        title: "Falha ao atualizar titulo da etapa",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "error",
      });
    } finally {
      setSavingInlineStageTitle(false);
    }
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

  const saveManualLead = async () => {
    if (!token || !manualLeadForm) return;

    const waId = manualLeadForm.waId.trim();
    if (!waId) {
      toast({
        title: "Numero do lead obrigatorio",
        description: "Informe o numero do WhatsApp do lead.",
        variant: "error",
      });
      return;
    }

    const playersRaw = manualLeadForm.playersCount.trim();
    if (playersRaw && !Number.isFinite(Number(playersRaw))) {
      toast({
        title: "Quantidade de jogadores invalida",
        description: "Use apenas numeros.",
        variant: "error",
      });
      return;
    }

    const parsedStageId = manualLeadForm.stageId
      ? Number(manualLeadForm.stageId)
      : null;
    if (parsedStageId !== null && !Number.isInteger(parsedStageId)) {
      toast({
        title: "Etapa invalida",
        description: "Selecione uma etapa valida.",
        variant: "error",
      });
      return;
    }

    setSavingManualLead(true);
    try {
      await api.createContact(token, {
        waId,
        name: toNullableText(manualLeadForm.name),
        email: toNullableText(manualLeadForm.email),
        tournament: toNullableText(manualLeadForm.tournament),
        category: toNullableText(manualLeadForm.category),
        city: toNullableText(manualLeadForm.city),
        teamName: toNullableText(manualLeadForm.teamName),
        playersCount: playersRaw ? Number(playersRaw) : null,
        stageId: parsedStageId,
      });
      toast({
        title: "Lead adicionado ao pipeline",
        description: manualLeadForm.name.trim() || waId,
        variant: "success",
      });
      setManualLeadForm(null);
      await load();
    } catch (err: unknown) {
      toast({
        title: "Falha ao criar lead manual",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "error",
      });
    } finally {
      setSavingManualLead(false);
    }
  };

  const deleteStage = async (stage: PipelineStage) => {
    if (!token) return;
    const confirmed = window.confirm(
      `Excluir etapa "${stage.name}"? Leads vinculados voltam para "Sem Estagio".`,
    );
    if (!confirmed) return;

    setSavingStage(true);
    setDeletingStageId(stage.id);
    try {
      await new Promise((resolve) => setTimeout(resolve, 180));
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
      setDeletingStageId((current) => (current === stage.id ? null : current));
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
    if (!canManageLeads) {
      toast({ title: "Sem permissão para editar status", variant: "error" });
      return;
    }
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
    if (!canManageLeads) {
      toast({ title: "Sem permissão para mover lead", variant: "error" });
      return;
    }
    if (contact.stageId === stageId) {
      setContextMenu(null);
      return;
    }

    setContextMenu(null);
    try {
      await persistLeadStageMove(contact.waId, stageId, "Lead movido");
    } finally {
      setContextMenu(null);
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

    setProcessingWaId(contact.waId);
    setDeletingLeadWaId(contact.waId);
    try {
      setContextMenu(null);
      await new Promise((resolve) => setTimeout(resolve, 180));
      const result = await retryRun(
        () => api.deleteContact(token, contact.waId),
        { actionLabel: "Excluir lead" },
      );
      if (result !== undefined) {
        setDetailsContact((current) => (current?.waId === contact.waId ? null : current));
        await load();
      }
    } finally {
      setProcessingWaId(null);
      setContextMenu(null);
      setDeletingLeadWaId((current) => (current === contact.waId ? null : current));
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
      const updated = await retryRun(
        () => api.updateContact(token, detailsContact.waId, payload),
        { actionLabel: "Salvar detalhes" },
      );
      if (updated) {
        upsertDetailsContact(updated);
        await load();
      }
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
      const resolvedChannel = resolveLeadOriginChannel(contact.channel, contact.waId);
      if (statusFilter !== "all" && normalizedStatus !== statusFilter) return false;
      if (channelFilter !== "all" && resolvedChannel !== channelFilter) return false;

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
        contact.source,
        contact.platformHandle,
        resolvedChannel === "INSTAGRAM" ? "instagram" : "whatsapp",
        contact.messages[0]?.body,
      ]
        .filter((value): value is string => Boolean(value))
        .join(" ")
        .toLowerCase();

      return haystack.includes(search);
    });
  };

  const boardOriginCounts = useMemo(() => {
    const summary = { WHATSAPP: 0, INSTAGRAM: 0 };
    if (!board) return summary;

    for (const contact of [
      ...board.unassigned.items,
      ...board.stages.flatMap((stage) => stage.items),
    ]) {
      summary[resolveLeadOriginChannel(contact.channel, contact.waId)] += 1;
    }

    return summary;
  }, [board]);

  const renderContactCard = (contact: PipelineContact, stageId: number | null) => {
    const status = normalizeLeadStatus(contact.leadStatus);
    const originMeta = getLeadOriginMeta(contact.channel, contact.waId);

    return (
      <div
        key={contact.waId}
        draggable={canManageLeads}
        onDragStart={() => {
          if (!canManageLeads) return;
          handleDragStart(contact.waId, stageId);
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          setContextMenu({
            x: event.clientX,
            y: event.clientY,
            contact,
          });
        }}
        className={cn(
          "relative overflow-hidden rounded-xl border border-border/80 bg-background/55 p-3 transition hover:border-primary/40",
          originMeta.panelClass,
          canManageLeads ? "cursor-grab active:cursor-grabbing" : "cursor-default",
          deletingLeadWaId === contact.waId && "anim-remove pointer-events-none opacity-70",
        )}
        title="Clique com o botao direito para abrir o menu de acoes"
      >
        <div
          className={cn(
            "absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b",
            originMeta.railClass,
          )}
        />
        <div className="flex items-start gap-2">
          <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 flex-1 whitespace-normal break-words text-sm font-medium leading-tight">
                {contact.name || "Sem nome"}
              </p>
              <div className="flex shrink-0 items-center gap-1">
                {movingLeadWaId === contact.waId ? (
                  <Badge variant="secondary" className="h-5 gap-1 px-2 text-[10px]">
                    <RefreshCcw className="h-3 w-3 animate-spin" />
                    Movendo
                  </Badge>
                ) : (
                  movedLeadWaId === contact.waId && (
                    <Badge variant="secondary" className="h-5 animate-pulse px-2 text-[10px]">
                      Movido
                    </Badge>
                  )
                )}
                <Badge
                  variant="outline"
                  className={cn("h-5 px-2 text-[10px]", leadStatusMeta[status].badgeClass)}
                >
                  {leadStatusMeta[status].label}
                </Badge>
              </div>
            </div>
            <LeadOriginBadge
              channel={contact.channel}
              waId={contact.waId}
              source={contact.source}
              platformHandle={contact.platformHandle}
              showHint
              compact
              className="mt-1"
            />
            <p className="mt-0.5 break-all text-xs text-muted-foreground">
              {contact.waId}
            </p>
            {contact.messages[0] && (
              <p className="mt-1 line-clamp-2 break-words text-xs text-muted-foreground">
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
    stage: PipelineStage | null,
    contacts: PipelineContact[],
  ) => {
    const title = stage?.name ?? "Sem Estagio";
    const color = stage?.color ?? "#6b7280";
    const stageId = stage?.id ?? null;
    const stageKey = String(stageId ?? "unassigned");
    const filteredContacts = applyContactFilters(contacts);

    const columnHeight = Math.min(
      COLUMN_MAX_HEIGHT,
      Math.max(COLUMN_MIN_HEIGHT, COLUMN_BASE_HEIGHT + filteredContacts.length * ROW_HEIGHT_ESTIMATE),
    );

    return (
    <div
        key={stageId ?? "unassigned"}
        className={cn(
          "flex min-h-0 w-72 shrink-0 flex-col self-start overflow-hidden rounded-xl border border-border/60 bg-card/50 transition",
          leadDropTargetKey === stageKey && "border-primary shadow-[0_0_0_2px_hsl(var(--primary)/0.35)]",
          stageId !== null && deletingStageId === stageId && "anim-remove pointer-events-none opacity-70",
        )}
        style={{ height: columnHeight }}
        onDragOver={(e) => {
          if (canManageLeads) e.preventDefault();
        }}
        onDrop={() => {
          if (canManageLeads) void handleDrop(stageId);
        }}
      >
        <div
          className="flex shrink-0 items-center gap-2 rounded-t-xl px-3 py-2.5"
          style={{ borderBottom: `3px solid ${color}` }}
        >
          <span
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: color }}
          />
          {inlineStageTitle?.id === stageId && stageId !== null ? (
            <div className="flex min-w-0 flex-1 items-center gap-1">
              <Input
                value={inlineStageTitle.name}
                onChange={(event) =>
                  setInlineStageTitle((current) =>
                    current ? { ...current, name: event.target.value } : current,
                  )
                }
                className="h-8"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void saveInlineStageTitle();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    cancelInlineStageTitleEdit();
                  }
                }}
                autoFocus
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0"
                onClick={() => void saveInlineStageTitle()}
                disabled={savingInlineStageTitle || !inlineStageTitle.name.trim()}
              >
                <Check className="h-3.5 w-3.5 text-emerald-300" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0"
                onClick={cancelInlineStageTitleEdit}
                disabled={savingInlineStageTitle}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <>
              <span className="text-sm font-semibold">{title}</span>
              {stageId !== null && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => {
                    if (stage) startInlineStageTitleEdit(stage);
                  }}
                >
                  <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              )}
            </>
          )}
          <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs">
            {filteredContacts.length}
          </span>
        </div>
      <div className="min-h-0 flex-1">
        <VirtualizedContactList
          contacts={filteredContacts}
          stageId={stageId}
          scrollKey={`${stageKey}:${filteredContacts.length}`}
          renderContactCard={renderContactCard}
        />
      </div>
      <div className="shrink-0 border-t border-border/60 px-2 py-1.5 text-[11px] text-muted-foreground">
        <div className="flex items-center justify-between">
          <span>{filteredContacts.length} lead(s)</span>
          <span>Rolagem otimizada</span>
        </div>
      </div>
    </div>
  );
  };

  const contextMenuPosition = useMemo(() => {
    if (!contextMenu) return null;
    const width = 320;
    const height = contextMenuMeasuredHeight ?? 430;
    const viewportPadding = 12;
    const maxLeft = window.innerWidth - width - 12;
    const maxTop = window.innerHeight - height - viewportPadding;
    const spaceBelow = window.innerHeight - contextMenu.y - viewportPadding;
    const shouldOpenUp = spaceBelow < height;
    const preferredTop = shouldOpenUp ? contextMenu.y - height : contextMenu.y;

    return {
      left: Math.max(viewportPadding, Math.min(contextMenu.x, maxLeft)),
      top: Math.max(viewportPadding, Math.min(preferredTop, maxTop)),
    };
  }, [contextMenu, contextMenuMeasuredHeight]);

  if (!board) {
    if (loading) {
      return (
        <div className="flex gap-4 overflow-x-auto py-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="w-72 shrink-0 rounded-xl border border-border/60 bg-card/50 p-3 space-y-3 animate-pulse">
              <div className="flex items-center justify-between">
                <div className="h-4 w-24 rounded-md bg-muted/60" />
                <div className="h-5 w-8 rounded-full bg-muted/60" />
              </div>
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="rounded-lg border border-border/40 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="h-3.5 w-2/3 rounded-md bg-muted/60" />
                    <div className="h-4 w-12 rounded-full bg-muted/60" />
                  </div>
                  <div className="h-3 w-full rounded-md bg-muted/60" />
                  <div className="h-3 w-1/2 rounded-md bg-muted/60" />
                </div>
              ))}
            </div>
          ))}
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-muted-foreground">Pipeline vazio.</p>
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
            variant="secondary"
            onClick={openManualLeadCreate}
            disabled={savingManualLead}
          >
            <Plus className="h-4 w-4" />
            Novo Lead
          </Button>
          <Button
            size="sm"
            onClick={openCreateStageForm}
            disabled={savingStage || !canManageLeads}
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

      {manualLeadForm && (
        <Card className="anim-pop border-primary/40 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Adicionar Lead Manual</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Numero WhatsApp *</label>
                <Input
                  value={manualLeadForm.waId}
                  onChange={(event) =>
                    setManualLeadForm((current) =>
                      current ? { ...current, waId: event.target.value } : current,
                    )
                  }
                  placeholder="5511999999999"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Nome</label>
                <Input
                  value={manualLeadForm.name}
                  onChange={(event) =>
                    setManualLeadForm((current) =>
                      current ? { ...current, name: event.target.value } : current,
                    )
                  }
                  placeholder="Nome do lead"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Etapa</label>
                <select
                  value={manualLeadForm.stageId}
                  onChange={(event) =>
                    setManualLeadForm((current) =>
                      current ? { ...current, stageId: event.target.value } : current,
                    )
                  }
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Sem Estagio</option>
                  {board.stages.map((stage) => (
                    <option key={stage.id} value={String(stage.id)}>
                      {stage.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Email</label>
                <Input
                  value={manualLeadForm.email}
                  onChange={(event) =>
                    setManualLeadForm((current) =>
                      current ? { ...current, email: event.target.value } : current,
                    )
                  }
                  placeholder="email@exemplo.com"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Campeonato</label>
                <Input
                  value={manualLeadForm.tournament}
                  onChange={(event) =>
                    setManualLeadForm((current) =>
                      current ? { ...current, tournament: event.target.value } : current,
                    )
                  }
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Categoria</label>
                <Input
                  value={manualLeadForm.category}
                  onChange={(event) =>
                    setManualLeadForm((current) =>
                      current ? { ...current, category: event.target.value } : current,
                    )
                  }
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Cidade</label>
                <Input
                  value={manualLeadForm.city}
                  onChange={(event) =>
                    setManualLeadForm((current) =>
                      current ? { ...current, city: event.target.value } : current,
                    )
                  }
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Time / Jogadores</label>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    value={manualLeadForm.teamName}
                    onChange={(event) =>
                      setManualLeadForm((current) =>
                        current ? { ...current, teamName: event.target.value } : current,
                      )
                    }
                    placeholder="Time"
                  />
                  <Input
                    inputMode="numeric"
                    value={manualLeadForm.playersCount}
                    onChange={(event) =>
                      setManualLeadForm((current) =>
                        current
                          ? { ...current, playersCount: event.target.value }
                          : current,
                      )
                    }
                    placeholder="Jogadores"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setManualLeadForm(null)}
                disabled={savingManualLead}
              >
                <X className="h-4 w-4" />
                Cancelar
              </Button>
              <Button
                onClick={() => void saveManualLead()}
                disabled={savingManualLead || !manualLeadForm.waId.trim()}
              >
                <Save className="h-4 w-4" />
                Salvar Lead
              </Button>
            </div>
          </CardContent>
        </Card>
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
                draggable={canManageLeads}
                onDragStart={() => {
                  if (!canManageLeads) return;
                  handleStageDragStart(stage.id);
                }}
                onDragOver={(event) => {
                  if (canManageLeads) event.preventDefault();
                }}
                onDrop={() => {
                  if (canManageLeads) void handleStageDrop(stage.id);
                }}
                className={cn(
                  "flex items-center gap-2 rounded-lg border border-border/70 bg-background/50 px-3 py-2 transition",
                  dragStageId === stage.id && "opacity-60",
                  deletingStageId === stage.id && "anim-remove pointer-events-none opacity-70",
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
                  disabled={!canManageLeads}
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => void deleteStage(stage)}
                  disabled={savingStage || !canManageLeads}
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
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-12">
                <div className="space-y-1 md:col-span-2 xl:col-span-6">
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
                <div className="space-y-1 xl:col-span-2">
                  <label className="text-xs text-muted-foreground">Cor</label>
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {colorPresets.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() =>
                            setStageForm((current) =>
                              current ? { ...current, color: preset } : current,
                            )
                          }
                          className={cn(
                            "h-6 w-6 rounded-md border border-border/60",
                            stageForm.color.toLowerCase() === preset.toLowerCase() &&
                              "ring-2 ring-primary ring-offset-1 ring-offset-background",
                          )}
                          style={{ backgroundColor: preset }}
                          aria-label={`Selecionar cor ${preset}`}
                        />
                      ))}
                    </div>
                    <Input
                      value={stageForm.color}
                      onChange={(e) =>
                        setStageForm((current) =>
                          current ? { ...current, color: e.target.value } : current,
                        )
                      }
                      placeholder="#06b6d4"
                      className="h-8"
                    />
                  </div>
                </div>
                <div className="space-y-1 xl:col-span-2">
                  <label className="text-xs text-muted-foreground">Status</label>
                  <div className="flex h-10 items-center gap-2 rounded-md border border-border/70 px-2">
                    <Switch
                      checked={stageForm.isActive}
                      onCheckedChange={(checked) =>
                        setStageForm((current) =>
                          current ? { ...current, isActive: checked } : current,
                        )
                      }
                    />
                    <span className="text-xs text-muted-foreground">Ativa</span>
                  </div>
                </div>
                <div className="flex items-end gap-2 md:col-span-2 xl:col-span-2">
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
          <CardTitle className="text-base">Filtros Principais</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline">Status: {statusFilterLabel[statusFilter]}</Badge>
            <Badge variant="outline">Handoff: {handoffFilterLabel[handoffFilter]}</Badge>
            <Badge variant="outline">Bot: {botFilterLabel[botFilter]}</Badge>
            <Badge variant="outline">Triagem: {triageFilterLabel[triageFilter]}</Badge>
            <Badge variant="outline">Origem: {channelFilterLabel[channelFilter]}</Badge>
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {(["WHATSAPP", "INSTAGRAM"] as const).map((originChannel) => {
              const originMeta = getLeadOriginMeta(originChannel);
              const OriginIcon = originMeta.Icon;
              const isActive = channelFilter === originChannel;
              return (
                <button
                  key={originChannel}
                  type="button"
                  onClick={() => setPFilter("channelFilter", isActive ? "all" : originChannel)}
                  className={cn(
                    "rounded-2xl border p-3 text-left transition hover:-translate-y-0.5",
                    originMeta.panelClass,
                    isActive && "ring-1 ring-white/20",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                        Origem
                      </p>
                      <p className="mt-1 text-sm font-semibold">{originMeta.label}</p>
                    </div>
                    <div
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-2xl backdrop-blur",
                        originMeta.iconWrapClass,
                      )}
                    >
                      <OriginIcon className="h-4 w-4" />
                    </div>
                  </div>
                  <p className="mt-3 text-2xl font-semibold tracking-tight">
                    {boardOriginCounts[originChannel]}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {isActive ? "Filtro ativo" : "Clique para isolar este canal"}
                  </p>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setPFilter("channelFilter", "all")}
              className={cn(
                "rounded-2xl border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] p-3 text-left transition hover:-translate-y-0.5 hover:border-white/20",
                channelFilter === "all" && "ring-1 ring-white/20",
              )}
            >
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                Separacao
              </p>
              <p className="mt-1 text-sm font-semibold">Todos os canais</p>
              <p className="mt-3 text-2xl font-semibold tracking-tight">
                {boardOriginCounts.WHATSAPP + boardOriginCounts.INSTAGRAM}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {channelFilter === "all" ? "Misturando os canais" : "Clique para voltar ao mix completo"}
              </p>
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Busca</label>
              <Input
                value={searchTerm}
                onChange={(event) => setPFilter("searchTerm", event.target.value)}
                placeholder="Buscar lead, telefone, cidade..."
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Status</label>
              <select
                value={statusFilter}
                onChange={(event) => setPFilter("statusFilter", event.target.value as "all" | LeadStatus)}
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
              >
                <option value="all">Todos</option>
                <option value="open">Aberto</option>
                <option value="won">Ganho</option>
                <option value="lost">Perdido</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Handoff</label>
              <select
                value={handoffFilter}
                onChange={(event) => setPFilter("handoffFilter", event.target.value as "all" | "yes" | "no")}
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
              >
                <option value="all">Todos</option>
                <option value="yes">Sim</option>
                <option value="no">Nao</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Bot</label>
              <select
                value={botFilter}
                onChange={(event) => setPFilter("botFilter", event.target.value as "all" | "on" | "off")}
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
              >
                <option value="all">Todos</option>
                <option value="on">Ligado</option>
                <option value="off">Desligado</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Triagem</label>
              <select
                value={triageFilter}
                onChange={(event) => setPFilter("triageFilter", event.target.value as "all" | "done" | "pending")}
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
              >
                <option value="all">Todos</option>
                <option value="done">Concluida</option>
                <option value="pending">Pendente</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Origem</label>
              <select
                value={channelFilter}
                onChange={(event) => setPFilter("channelFilter", event.target.value as ChannelFilter)}
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
              >
                <option value="all">Todos</option>
                <option value="WHATSAPP">WhatsApp</option>
                <option value="INSTAGRAM">Instagram</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-start gap-4 overflow-x-auto pb-4">
        {renderColumn(null, board.unassigned.items)}
        {board.stages.map((stage) => renderColumn(stage, stage.items))}
      </div>

      {contextMenu && contextMenuPosition && (
        <div className="fixed inset-0 z-50" onClick={() => setContextMenu(null)}>
          <Card
            ref={contextMenuRef}
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
              <LeadOriginBadge
                channel={contextMenu.contact.channel}
                waId={contextMenu.contact.waId}
                source={contextMenu.contact.source}
                platformHandle={contextMenu.contact.platformHandle}
                showHint
                compact
                className="pt-1"
              />
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

              {canManageLeads ? (
                <>
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
                </>
              ) : (
                <p className="px-2 py-1 text-xs text-muted-foreground">
                  Sem permissao para editar status, mover etapa ou excluir.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {detailsContact && detailsForm && createPortal(
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-background/65 px-4 py-6 backdrop-blur-sm"
          onClick={() => setDetailsContact(null)}
        >
          <Card
            className="anim-pop flex max-h-[92vh] w-full max-w-3xl flex-col border-border/90"
            onClick={(event) => event.stopPropagation()}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle>{detailsContact.name || detailsContact.waId}</CardTitle>
                  <p className="text-xs text-muted-foreground">{detailsContact.waId}</p>
                  <LeadOriginBadge
                    channel={detailsContact.channel}
                    waId={detailsContact.waId}
                    source={detailsContact.source}
                    platformHandle={detailsContact.platformHandle}
                    showHint
                    className="pt-2"
                  />
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
                      Separado como {channelFilterLabel[resolveLeadOriginChannel(detailsContact.channel, detailsContact.waId)]}
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
        </div>,
        document.body,
      )}
    </div>
  );
}
