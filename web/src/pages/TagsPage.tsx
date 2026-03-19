import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Edit2, Plus, Save, Trash2, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { api, type Tag } from "@/lib/api";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import TagBadge from "@/components/dashboard/TagBadge";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

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

export default function TagsPage() {
  const { token, user } = useAuth();
  const [tags, setTags] = useState<Tag[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#06b6d4");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const limit = 20;
  const canManageTags = hasPermission(user, PERMISSIONS.TAGS_MANAGE);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await api.tags(token, {
        limit,
        offset: (page - 1) * limit,
        search,
      });
      setTags(data.items);
      setTotal(data.total);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [token, page, search]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const resetForm = () => {
    setName("");
    setColor("#06b6d4");
    setEditingId(null);
  };

  const startEdit = (tag: Tag) => {
    setEditingId(tag.id);
    setName(tag.name);
    setColor(tag.color);
  };

  const create = async () => {
    if (!token || !name.trim() || !canManageTags) return;
    try {
      if (editingId) {
        await api.updateTag(token, editingId, { name: name.trim(), color });
      } else {
        await api.createTag(token, { name: name.trim(), color });
      }
      resetForm();
      await load();
    } catch {
      /* ignore */
    }
  };

  const remove = async (id: number) => {
    if (!token || !canManageTags) return;
    try {
      await api.deleteTag(token, id);
      await load();
    } catch {
      /* ignore */
    }
  };

  return (
    <motion.div className="space-y-5" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: "easeOut" }}>
      <h2 className="text-xl font-bold">Tags</h2>

      {!canManageTags && (
        <p className="text-sm text-muted-foreground">
          Seu cargo pode consultar tags, mas nao criar, editar ou excluir.
        </p>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>{editingId ? "Editar Tag" : "Nova Tag"}</CardTitle>
        </CardHeader>
        <CardContent className="flex items-end gap-3 p-4 pt-0">
          <div className="flex-1 space-y-1">
            <Label>Nome</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: VIP"
              onKeyDown={(e) => {
                if (e.key === "Enter") void create();
              }}
            />
          </div>
          <div className="space-y-1">
            <Label>Cor</Label>
            <div className="space-y-1.5">
              <div className="flex flex-wrap gap-1.5">
                {colorPresets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setColor(preset)}
                    disabled={!canManageTags}
                    className={cn(
                      "h-6 w-6 rounded-md border border-border/60",
                      color.toLowerCase() === preset.toLowerCase() &&
                        "ring-2 ring-primary ring-offset-1 ring-offset-background",
                    )}
                    style={{ backgroundColor: preset }}
                    aria-label={`Selecionar cor ${preset}`}
                  />
                ))}
              </div>
              <Input
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-9 w-28"
                placeholder="#06b6d4"
                disabled={!canManageTags}
              />
            </div>
          </div>
          <Button size="sm" onClick={() => void create()} disabled={!name.trim() || !canManageTags}>
            {editingId ? (
              <>
                <Save className="h-4 w-4 mr-1" /> Salvar
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-1" /> Criar
              </>
            )}
          </Button>
          {editingId && (
            <Button size="sm" variant="outline" onClick={resetForm} disabled={!canManageTags}>
              <X className="h-4 w-4 mr-1" /> Cancelar
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-2 p-4 sm:grid-cols-2">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar tags por nome"
          />
          <div className="text-sm text-muted-foreground sm:text-right sm:self-center">
            {total} tag(s)
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        {loading && (
          <div className="flex flex-wrap gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-card/50 px-3 py-2 animate-pulse">
                <div className="h-5 w-16 rounded-full bg-muted/60" />
                <div className="h-6 w-6 rounded bg-muted/60" />
              </div>
            ))}
          </div>
        )}
        {tags.map((tag) => (
          <div
            key={tag.id}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card/60 px-3 py-2"
          >
            <TagBadge name={tag.name} color={tag.color} />
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => startEdit(tag)}
              disabled={!canManageTags}
            >
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => void remove(tag.id)}
              disabled={!canManageTags}
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        ))}
        {!loading && !tags.length && (
          <p className="text-sm text-muted-foreground py-4">
            Nenhuma tag cadastrada. Tags podem ser atribuidas a contatos no pipeline e conversas.
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
    </motion.div>
  );
}
