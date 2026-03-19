import { useCallback, useEffect, useState } from "react";
import { Edit2, Plus, Save, ToggleLeft, ToggleRight, Trash2, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { api, type Faq } from "@/lib/api";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function FaqsPage() {
  const { token, user } = useAuth();
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [page, setPage] = useState(1);
  const limit = 10;
  const canManageFaqs = hasPermission(user, PERMISSIONS.FAQS_MANAGE);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await api.faqs(token, {
        limit,
        offset: (page - 1) * limit,
        search,
        isActive:
          activeFilter === "active"
            ? true
            : activeFilter === "inactive"
              ? false
              : undefined,
      });
      setFaqs(data.items);
      setTotal(data.total);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [token, page, search, activeFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [search, activeFilter]);

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setQuestion("");
    setAnswer("");
  };

  const startEdit = (faq: Faq) => {
    setEditingId(faq.id);
    setQuestion(faq.question);
    setAnswer(faq.answer);
    setShowForm(true);
  };

  const save = async () => {
    if (!token || !question.trim() || !answer.trim() || !canManageFaqs) return;
    try {
      if (editingId) {
        await api.updateFaq(token, editingId, { question, answer });
      } else {
        await api.createFaq(token, { question, answer });
      }
      resetForm();
      await load();
    } catch {
      /* ignore */
    }
  };

  const toggleActive = async (faq: Faq) => {
    if (!token || !canManageFaqs) return;
    try {
      await api.updateFaq(token, faq.id, { isActive: !faq.isActive });
      await load();
    } catch {
      /* ignore */
    }
  };

  const remove = async (id: number) => {
    if (!token || !canManageFaqs) return;
    try {
      await api.deleteFaq(token, id);
      await load();
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="stagger space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">FAQs</h2>
        <Button size="sm" onClick={() => setShowForm(true)} disabled={!canManageFaqs}>
          <Plus className="h-4 w-4 mr-1" /> Nova FAQ
        </Button>
      </div>

      {!canManageFaqs && (
        <p className="text-sm text-muted-foreground">
          Seu cargo pode consultar FAQs, mas nao criar, editar, ativar ou excluir.
        </p>
      )}

      {showForm && (
        <Card className="anim-pop">
          <CardHeader className="pb-3">
            <CardTitle>{editingId ? "Editar FAQ" : "Nova FAQ"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>Pergunta</Label>
              <Input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ex: Qual o horario do campeonato?"
              />
            </div>
            <div className="space-y-1">
              <Label>Resposta</Label>
              <Input
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Ex: O campeonato acontece todos os sabados as 14h."
              />
            </div>
            <div className="flex gap-2">
                <Button size="sm" onClick={() => void save()} disabled={!canManageFaqs}>
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
            placeholder="Buscar por pergunta ou resposta"
          />
          <select
            value={activeFilter}
            onChange={(event) => setActiveFilter(event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Todos os status</option>
            <option value="active">Ativo</option>
            <option value="inactive">Inativo</option>
          </select>
          <div className="text-sm text-muted-foreground sm:text-right sm:self-center">
            {total} FAQ(s)
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border/60 bg-card/50 p-4 space-y-2 animate-pulse">
                <div className="h-4 w-2/3 rounded-md bg-muted/60" />
                <div className="h-3 w-full rounded-md bg-muted/60" />
              </div>
            ))}
          </div>
        )}
        {faqs.map((faq) => (
          <Card key={faq.id}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-base">{faq.question}</p>
                <p className="text-sm text-muted-foreground mt-1">{faq.answer}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => void toggleActive(faq)}
                  disabled={!canManageFaqs}
                  title={faq.isActive ? "Desativar" : "Ativar"}
                >
                  {faq.isActive ? (
                    <ToggleRight className="h-4 w-4 text-green-500" />
                  ) : (
                    <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => startEdit(faq)}
                  disabled={!canManageFaqs}
                >
                  <Edit2 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => void remove(faq.id)}
                  disabled={!canManageFaqs}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {!loading && !faqs.length && (
          <p className="text-sm text-muted-foreground py-4">
            Nenhuma FAQ cadastrada. FAQs ativas sao injetadas automaticamente no prompt da IA.
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
