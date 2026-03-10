import { useCallback, useEffect, useRef, useState } from "react";
import { Edit2, Play, Pause, Plus, Save, Trash2, Upload, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { api, type Audio } from "@/lib/api";
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

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function AudiosPage() {
  const { token } = useAuth();
  const [audios, setAudios] = useState<Audio[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("geral");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [page, setPage] = useState(1);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const limit = 10;

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await api.audios(token, {
        limit,
        offset: (page - 1) * limit,
        search,
        category: categoryFilter || undefined,
      });
      setAudios(data.items);
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
    setCategory("geral");
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const startEdit = (a: Audio) => {
    setEditingId(a.id);
    setTitle(a.title);
    setCategory(a.category);
    setFile(null);
    setShowForm(true);
  };

  const save = async () => {
    if (!token) return;
    try {
      if (editingId) {
        await api.updateAudio(token, editingId, { title, category });
      } else {
        if (!file) return;
        setUploading(true);
        await api.uploadAudio(token, file, { title: title || undefined, category });
      }
      resetForm();
      await load();
    } catch {
      /* ignore */
    } finally {
      setUploading(false);
    }
  };

  const remove = async (id: number) => {
    if (!token) return;
    stopAudio();
    try {
      await api.deleteAudio(token, id);
      await load();
    } catch {
      /* ignore */
    }
  };

  const togglePlay = (a: Audio) => {
    if (playingId === a.id) {
      stopAudio();
      return;
    }
    stopAudio();
    const audio = new Audio(a.url);
    audio.addEventListener("ended", () => setPlayingId(null));
    audioRef.current = audio;
    void audio.play();
    setPlayingId(a.id);
  };

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setPlayingId(null);
  };

  useEffect(() => {
    return () => stopAudio();
  }, []);

  return (
    <div className="stagger space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Audios</h2>
        <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Novo Audio
        </Button>
      </div>

      {showForm && (
        <Card className="anim-pop">
          <CardHeader className="pb-3">
            <CardTitle>{editingId ? "Editar Audio" : "Enviar Audio"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!editingId && (
              <div className="space-y-1">
                <Label>Arquivo de audio</Label>
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setFile(f);
                    if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ""));
                  }}
                />
              </div>
            )}
            <div className="space-y-1">
              <Label>Titulo</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Boas-vindas torneio"
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
              <Button
                size="sm"
                onClick={() => void save()}
                disabled={uploading || (!editingId && !file)}
              >
                {uploading ? (
                  <>
                    <Upload className="h-4 w-4 mr-1 animate-pulse" /> Enviando...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-1" /> Salvar
                  </>
                )}
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
            placeholder="Buscar por titulo ou arquivo"
          />
          <Input
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            placeholder="Filtrar categoria"
          />
          <div className="text-sm text-muted-foreground sm:text-right sm:self-center">
            {total} audio(s)
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
                <div className="h-3 w-2/3 rounded-md bg-muted/60" />
              </div>
            ))}
          </div>
        )}
        {audios.map((a) => (
          <Card key={a.id}>
            <CardContent className="flex items-center gap-3 p-4">
              <Button
                variant="ghost"
                size="sm"
                className="h-9 w-9 p-0 shrink-0"
                onClick={() => togglePlay(a)}
              >
                {playingId === a.id ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </Button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-base truncate">{a.title}</p>
                  <Badge variant="secondary" className="text-[10px]">
                    {a.category}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {a.filename} — {formatBytes(a.sizeBytes)}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => startEdit(a)}
                >
                  <Edit2 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => void remove(a.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {!loading && !audios.length && (
          <p className="text-sm text-muted-foreground py-4">
            Nenhum audio cadastrado. Envie arquivos de audio para usar no atendimento.
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
