import { useCallback, useEffect, useMemo, useState } from "react";
import { Edit2, Plus, RefreshCcw, Save, Trash2, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import {
  api,
  type PipelineBoard,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type ContactOption = {
  waId: string;
  label: string;
};

type TaskFormState = {
  waId: string;
  title: string;
  description: string;
  dueAt: string;
  status: TaskStatus;
  priority: TaskPriority;
};

const statusMeta: Record<TaskStatus, { label: string; badgeClass: string }> = {
  open: {
    label: "Aberta",
    badgeClass: "border-cyan-500/50 bg-cyan-500/10 text-cyan-200",
  },
  in_progress: {
    label: "Em andamento",
    badgeClass: "border-amber-500/50 bg-amber-500/10 text-amber-200",
  },
  done: {
    label: "Concluida",
    badgeClass: "border-emerald-500/50 bg-emerald-500/10 text-emerald-200",
  },
  cancelled: {
    label: "Cancelada",
    badgeClass: "border-rose-500/50 bg-rose-500/10 text-rose-200",
  },
};

const priorityMeta: Record<TaskPriority, { label: string; badgeClass: string }> = {
  low: {
    label: "Baixa",
    badgeClass: "border-slate-500/50 bg-slate-500/10 text-slate-200",
  },
  medium: {
    label: "Media",
    badgeClass: "border-blue-500/50 bg-blue-500/10 text-blue-200",
  },
  high: {
    label: "Alta",
    badgeClass: "border-orange-500/50 bg-orange-500/10 text-orange-200",
  },
  urgent: {
    label: "Urgente",
    badgeClass: "border-red-500/50 bg-red-500/10 text-red-200",
  },
};

const asTaskStatus = (value: string): TaskStatus =>
  value === "in_progress" || value === "done" || value === "cancelled"
    ? value
    : "open";

const asTaskPriority = (value: string): TaskPriority =>
  value === "low" || value === "high" || value === "urgent" ? value : "medium";

const formatDate = (value: string): string =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));

const toDateTimeLocalValue = (isoDate: string): string => {
  const date = new Date(isoDate);
  const localTime = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localTime.toISOString().slice(0, 16);
};

const fromDateTimeLocalValue = (value: string): string =>
  new Date(value).toISOString();

const emptyTaskForm = (): TaskFormState => ({
  waId: "",
  title: "",
  description: "",
  dueAt: toDateTimeLocalValue(new Date().toISOString()),
  status: "open",
  priority: "medium",
});

const extractContactsFromBoard = (board: PipelineBoard): ContactOption[] => {
  const map = new Map<string, ContactOption>();
  for (const contact of board.unassigned) {
    map.set(contact.waId, {
      waId: contact.waId,
      label: contact.name ? `${contact.name} (${contact.waId})` : contact.waId,
    });
  }
  for (const stage of board.stages) {
    for (const contact of stage.contacts) {
      map.set(contact.waId, {
        waId: contact.waId,
        label: contact.name ? `${contact.name} (${contact.waId})` : contact.waId,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
};

export default function TasksPage() {
  const { token, logout } = useAuth();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "">("");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "">("");
  const [createForm, setCreateForm] = useState<TaskFormState>(() => emptyTaskForm());
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<TaskFormState | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [taskData, boardData] = await Promise.all([
        api.tasks(token, {
          status: statusFilter,
          priority: priorityFilter,
        }),
        api.pipelineBoard(token),
      ]);
      setTasks(taskData);
      setContacts(extractContactsFromBoard(boardData));
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
      setError(err instanceof Error ? err.message : "Falha ao carregar tarefas.");
    } finally {
      setLoading(false);
    }
  }, [token, statusFilter, priorityFilter, logout]);

  useEffect(() => {
    void load();
  }, [load]);

  const canCreate = useMemo(
    () =>
      Boolean(
        createForm.waId &&
          createForm.title.trim() &&
          createForm.dueAt &&
          !Number.isNaN(new Date(createForm.dueAt).getTime()),
      ),
    [createForm],
  );

  const createTask = async () => {
    if (!token || !canCreate) return;
    setSaving(true);
    try {
      await api.createTask(token, {
        waId: createForm.waId,
        title: createForm.title.trim(),
        description: createForm.description.trim() || undefined,
        dueAt: fromDateTimeLocalValue(createForm.dueAt),
        status: createForm.status,
        priority: createForm.priority,
      });
      setCreateForm(emptyTaskForm());
      toast({ title: "Tarefa criada", variant: "success" });
      await load();
    } catch (err: unknown) {
      toast({
        title: "Falha ao criar tarefa",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const beginEditTask = (task: Task) => {
    setEditingTaskId(task.id);
    setEditForm({
      waId: task.contact.waId,
      title: task.title,
      description: task.description ?? "",
      dueAt: toDateTimeLocalValue(task.dueAt),
      status: asTaskStatus(task.status),
      priority: asTaskPriority(task.priority),
    });
  };

  const saveTask = async (taskId: number) => {
    if (!token || !editForm) return;
    if (!editForm.title.trim() || !editForm.dueAt) return;

    setSaving(true);
    try {
      await api.updateTask(token, taskId, {
        waId: editForm.waId,
        title: editForm.title.trim(),
        description: editForm.description.trim() || null,
        dueAt: fromDateTimeLocalValue(editForm.dueAt),
        status: editForm.status,
        priority: editForm.priority,
      });
      setEditingTaskId(null);
      setEditForm(null);
      toast({ title: "Tarefa atualizada", variant: "success" });
      await load();
    } catch (err: unknown) {
      toast({
        title: "Falha ao salvar tarefa",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const removeTask = async (task: Task) => {
    if (!token) return;
    const confirmed = window.confirm(
      `Excluir tarefa "${task.title}" de ${task.contact.name || task.contact.waId}?`,
    );
    if (!confirmed) return;

    setSaving(true);
    try {
      await api.deleteTask(token, task.id);
      toast({ title: "Tarefa excluida", variant: "success" });
      if (editingTaskId === task.id) {
        setEditingTaskId(null);
        setEditForm(null);
      }
      await load();
    } catch (err: unknown) {
      toast({
        title: "Falha ao excluir tarefa",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="stagger space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold">Tarefas</h2>
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

      <Card className="border-border/70">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Nova tarefa</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Contato</label>
            <select
              value={createForm.waId}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, waId: event.target.value }))
              }
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Selecione um contato</option>
              {contacts.map((contact) => (
                <option key={contact.waId} value={contact.waId}>
                  {contact.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Titulo</label>
            <Input
              value={createForm.title}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, title: event.target.value }))
              }
              placeholder="Ex: Confirmar regulamento"
            />
          </div>
          <div className="space-y-1 md:col-span-2">
            <label className="text-xs text-muted-foreground">Descricao</label>
            <Input
              value={createForm.description}
              onChange={(event) =>
                setCreateForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              placeholder="Detalhes da tarefa"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Prazo</label>
            <Input
              type="datetime-local"
              value={createForm.dueAt}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, dueAt: event.target.value }))
              }
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Status</label>
            <select
              value={createForm.status}
              onChange={(event) =>
                setCreateForm((current) => ({
                  ...current,
                  status: asTaskStatus(event.target.value),
                }))
              }
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {Object.entries(statusMeta).map(([value, meta]) => (
                <option key={value} value={value}>
                  {meta.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Prioridade</label>
            <select
              value={createForm.priority}
              onChange={(event) =>
                setCreateForm((current) => ({
                  ...current,
                  priority: asTaskPriority(event.target.value),
                }))
              }
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {Object.entries(priorityMeta).map(([value, meta]) => (
                <option key={value} value={value}>
                  {meta.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end justify-end">
            <Button onClick={() => void createTask()} disabled={!canCreate || saving}>
              <Plus className="h-4 w-4" />
              Criar tarefa
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtro</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Status</label>
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(
                  event.target.value ? asTaskStatus(event.target.value) : "",
                )
              }
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Todos</option>
              {Object.entries(statusMeta).map(([value, meta]) => (
                <option key={value} value={value}>
                  {meta.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Prioridade</label>
            <select
              value={priorityFilter}
              onChange={(event) =>
                setPriorityFilter(
                  event.target.value ? asTaskPriority(event.target.value) : "",
                )
              }
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Todas</option>
              {Object.entries(priorityMeta).map(([value, meta]) => (
                <option key={value} value={value}>
                  {meta.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end justify-end">
            <Button variant="outline" onClick={() => void load()} disabled={loading}>
              Aplicar
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {loading && (
          <p className="text-sm text-muted-foreground">Carregando tarefas...</p>
        )}
        {!loading && !tasks.length && (
          <p className="text-sm text-muted-foreground">
            Nenhuma tarefa encontrada com os filtros atuais.
          </p>
        )}
        {tasks.map((task) => {
          const isEditing = editingTaskId === task.id && editForm;
          const status = asTaskStatus(task.status);
          const priority = asTaskPriority(task.priority);

          return (
            <Card key={task.id} className="border-border/70">
              <CardContent className="p-3">
                {!isEditing ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">{task.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {task.contact.name || task.contact.waId}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className={cn("h-5 px-2 text-[10px]", statusMeta[status].badgeClass)}
                        >
                          {statusMeta[status].label}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn(
                            "h-5 px-2 text-[10px]",
                            priorityMeta[priority].badgeClass,
                          )}
                        >
                          {priorityMeta[priority].label}
                        </Badge>
                      </div>
                    </div>
                    {task.description && (
                      <p className="text-sm text-foreground/90">{task.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Prazo: {formatDate(task.dueAt)}
                    </p>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => beginEditTask(task)}
                        disabled={saving}
                      >
                        <Edit2 className="h-4 w-4" />
                        Editar
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => void removeTask(task)}
                        disabled={saving}
                      >
                        <Trash2 className="h-4 w-4" />
                        Excluir
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-2 md:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Contato</label>
                      <select
                        value={editForm.waId}
                        onChange={(event) =>
                          setEditForm((current) =>
                            current ? { ...current, waId: event.target.value } : current,
                          )
                        }
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        {contacts.map((contact) => (
                          <option key={contact.waId} value={contact.waId}>
                            {contact.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Titulo</label>
                      <Input
                        value={editForm.title}
                        onChange={(event) =>
                          setEditForm((current) =>
                            current ? { ...current, title: event.target.value } : current,
                          )
                        }
                      />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <label className="text-xs text-muted-foreground">Descricao</label>
                      <Input
                        value={editForm.description}
                        onChange={(event) =>
                          setEditForm((current) =>
                            current
                              ? { ...current, description: event.target.value }
                              : current,
                          )
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Prazo</label>
                      <Input
                        type="datetime-local"
                        value={editForm.dueAt}
                        onChange={(event) =>
                          setEditForm((current) =>
                            current ? { ...current, dueAt: event.target.value } : current,
                          )
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Status</label>
                      <select
                        value={editForm.status}
                        onChange={(event) =>
                          setEditForm((current) =>
                            current
                              ? {
                                  ...current,
                                  status: asTaskStatus(event.target.value),
                                }
                              : current,
                          )
                        }
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        {Object.entries(statusMeta).map(([value, meta]) => (
                          <option key={value} value={value}>
                            {meta.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Prioridade</label>
                      <select
                        value={editForm.priority}
                        onChange={(event) =>
                          setEditForm((current) =>
                            current
                              ? {
                                  ...current,
                                  priority: asTaskPriority(event.target.value),
                                }
                              : current,
                          )
                        }
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        {Object.entries(priorityMeta).map(([value, meta]) => (
                          <option key={value} value={value}>
                            {meta.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-end justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingTaskId(null);
                          setEditForm(null);
                        }}
                        disabled={saving}
                      >
                        <X className="h-4 w-4" />
                        Cancelar
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => void saveTask(task.id)}
                        disabled={saving}
                      >
                        <Save className="h-4 w-4" />
                        Salvar
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
