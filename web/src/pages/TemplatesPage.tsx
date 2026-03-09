import { useCallback, useEffect, useState } from "react";
import { Edit2, Plus, Save, Trash2, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { api, type MessageTemplate } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function TemplatesPage() {
  const { token } = useAuth();
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("geral");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [page, setPage] = useState(1);
  const limit = 10;

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await api.templates(token, {
        limit,
        offset: (page - 1) * limit,
        search,
        category: categoryFilter || undefined,
      });
      setTemplates(data.items);
      setTotal(data.total);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [token, page, search, categoryFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [search, categoryFilter]);

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setTitle("");
    setBody("");
    setCategory("geral");
  };

  const startEdit = (t: MessageTemplate) => {
    setEditingId(t.id);
    setTitle(t.title);
    setBody(t.body);
    setCategory(t.category);
    setShowForm(true);
  };

  const save = async () => {
    if (!token || !title.trim() || !body.trim()) return;
    try {
      if (editingId) {
        await api.updateTemplate(token, editingId, { title, body, category });
      } else {
        await api.createTemplate(token, { title, body, category });
      }
      resetForm();
      await load();
    } catch {
      /* ignore */
    }
  };

  const remove = async (id: number) => {
    if (!token) return;
    try {
      await api.deleteTemplate(token, id);
      await load();
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="stagger space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Templates</h2>
        <Button size="sm" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-1" /> Novo Template
        </Button>
      </div>

      {showForm && (
        <Card className="anim-pop">
          <CardHeader className="pb-3">
            <CardTitle>{editingId ? "Editar Template" : "Novo Template"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>Titulo</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Boas-vindas"
              />
            </div>
            <div className="space-y-1">
              <Label>Corpo</Label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Ex: Ola! Bem-vindo ao campeonato..."
              />
            </div>
            <div className="space-y-1">
              <Label>Categoria</Label>
              <Input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="geral"
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => void save()}>
                <Save className="h-4 w-4 mr-1" /> Salvar
              </Button>
              <Button size="sm" variant="outline" onClick={resetForm}>
                <X className="h-4 w-4 mr-1" /> Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="grid gap-2 p-4 sm:grid-cols-3">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por titulo ou corpo"
          />
          <Input
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            placeholder="Filtrar categoria"
          />
          <div className="text-sm text-muted-foreground sm:text-right sm:self-center">
            {total} template(s)
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border/60 bg-card/50 p-4 space-y-2 animate-pulse">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-1/4 rounded-md bg-muted/60" />
                  <div className="h-5 w-14 rounded-full bg-muted/60" />
                </div>
                <div className="h-3 w-full rounded-md bg-muted/60" />
                <div className="h-3 w-2/3 rounded-md bg-muted/60" />
              </div>
            ))}
          </div>
        )}
        {templates.map((t) => (
          <Card key={t.id}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-base">{t.title}</p>
                  <Badge variant="secondary" className="text-[10px]">
                    {t.category}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">{t.body}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => startEdit(t)}
                >
                  <Edit2 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => void remove(t.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {!loading && !templates.length && (
          <p className="text-sm text-muted-foreground py-4">
            Nenhum template cadastrado. Templates servem como respostas rapidas no chat humano.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border/70 bg-card/40 px-3 py-2 text-sm">
        <span className="text-muted-foreground">
          Pagina {page} de {Math.max(1, Math.ceil(total / limit))}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= Math.max(1, Math.ceil(total / limit))}
            onClick={() =>
              setPage((current) =>
                Math.min(Math.max(1, Math.ceil(total / limit)), current + 1),
              )
            }
          >
            Proxima
          </Button>
        </div>
      </div>
    </div>
  );
}
