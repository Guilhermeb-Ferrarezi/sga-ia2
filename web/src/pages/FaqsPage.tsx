import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Edit2,
  Filter,
  Plus,
  Save,
  ToggleLeft,
  ToggleRight,
  Trash2,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { api, type Faq, type FaqType } from "@/lib/api";
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
import { Textarea } from "@/components/ui/textarea";

const FAQ_TYPES: { value: FaqType; label: string }[] = [
  { value: "general", label: "Geral" },
  { value: "tournament", label: "Campeonato" },
  { value: "registration", label: "Inscricao" },
  { value: "rules", label: "Regras" },
  { value: "pricing", label: "Precos" },
  { value: "other", label: "Outro" },
];

const typeColor: Record<string, string> = {
  general: "bg-blue-500/15 text-blue-400",
  tournament: "bg-purple-500/15 text-purple-400",
  registration: "bg-green-500/15 text-green-400",
  rules: "bg-amber-500/15 text-amber-400",
  pricing: "bg-emerald-500/15 text-emerald-400",
  other: "bg-gray-500/15 text-gray-400",
};

const FAQ_CONTENT_ONLY_PREFIX = "__content__:";

const isGeneratedFaqQuestion = (question: string): boolean =>
  question.startsWith(FAQ_CONTENT_ONLY_PREFIX);

const getFaqTitle = (faq: Faq): string => {
  if (!isGeneratedFaqQuestion(faq.question) && faq.question.trim()) {
    return faq.question;
  }

  if (faq.subject?.trim()) {
    return faq.subject.trim();
  }

  return FAQ_TYPES.find((type) => type.value === faq.faqType)?.label ?? "FAQ";
};

const getFaqBody = (faq: Faq): string => faq.content?.trim() || faq.answer?.trim() || "";

const listItem = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, x: -30, scale: 0.95 },
};

const FAQ_BODY_COLLAPSED_HEIGHT = 150;

function FaqBodyPreview({ content }: { content: string }) {
  const contentId = useId();
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [contentHeight, setContentHeight] = useState(FAQ_BODY_COLLAPSED_HEIGHT);

  useEffect(() => {
    const element = contentRef.current;
    if (!element) return;

    const measure = () => {
      const nextHeight = element.scrollHeight;
      setContentHeight(nextHeight);
      setIsOverflowing(nextHeight > FAQ_BODY_COLLAPSED_HEIGHT);
    };

    measure();

    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(measure);
    observer.observe(element);

    return () => observer.disconnect();
  }, [content]);

  useEffect(() => {
    if (!isOverflowing && expanded) {
      setExpanded(false);
    }
  }, [expanded, isOverflowing]);

  return (
    <div className="space-y-2">
      <motion.div
        initial={false}
        animate={{
          height: expanded || !isOverflowing ? contentHeight : FAQ_BODY_COLLAPSED_HEIGHT,
        }}
        transition={{ duration: 0.32, ease: "easeOut" }}
        className="relative overflow-hidden"
      >
        <div id={contentId} ref={contentRef}>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {content}
          </p>
        </div>
        {!expanded && isOverflowing && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-card via-card/90 to-transparent" />
        )}
      </motion.div>

      {isOverflowing && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs text-primary hover:text-primary"
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? (
            <>
              <ChevronUp className="mr-1 h-3.5 w-3.5" />
              Mostrar menos
            </>
          ) : (
            <>
              <ChevronDown className="mr-1 h-3.5 w-3.5" />
              Mostrar tudo
            </>
          )}
        </Button>
      )}
    </div>
  );
}

export default function FaqsPage() {
  const { token, user } = useAuth();
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [total, setTotal] = useState(0);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [editions, setEditions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [subject, setSubject] = useState("");
  const [edition, setEdition] = useState("");
  const [faqType, setFaqType] = useState<string>("general");
  const [content, setContent] = useState("");
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [faqTypeFilter, setFaqTypeFilter] = useState("");
  const [page, setPage] = useState(1);
  const [selectedFaqIds, setSelectedFaqIds] = useState<Set<number>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);
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
        subject: subjectFilter || undefined,
        faqType: faqTypeFilter || undefined,
      });
      setFaqs(data.items);
      setTotal(data.total);
      if (data.subjects) setSubjects(data.subjects);
      if (data.editions) setEditions(data.editions);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [token, page, search, activeFilter, subjectFilter, faqTypeFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [search, activeFilter, subjectFilter, faqTypeFilter]);

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setSubject("");
    setEdition("");
    setFaqType("general");
    setContent("");
  };

  const startEdit = (faq: Faq) => {
    setEditingId(faq.id);
    setSubject(faq.subject ?? "");
    setEdition(faq.edition ?? "");
    setFaqType(faq.faqType ?? "general");
    setContent(getFaqBody(faq));
    setShowForm(true);
  };

  const save = async () => {
    if (!token || !content.trim() || !canManageFaqs) return;
    try {
      const payload = {
        subject: subject || undefined,
        edition: edition || undefined,
        faqType: faqType || "general",
        content: content || undefined,
      };
      if (editingId) {
        await api.updateFaq(token, editingId, payload);
      } else {
        await api.createFaq(token, payload);
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
      setSelectedFaqIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      await load();
    } catch {
      /* ignore */
    }
  };

  const toggleFaqSelection = (id: number) => {
    if (!canManageFaqs) return;
    setSelectedFaqIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelectedFaqs = () => setSelectedFaqIds(new Set());

  const allVisibleSelected =
    faqs.length > 0 && faqs.every((faq) => selectedFaqIds.has(faq.id));

  const toggleSelectVisibleFaqs = () => {
    if (!canManageFaqs) return;
    setSelectedFaqIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        faqs.forEach((faq) => next.delete(faq.id));
      } else {
        faqs.forEach((faq) => next.add(faq.id));
      }
      return next;
    });
  };

  const applyBatchActiveState = async (isActive: boolean) => {
    if (!token || !canManageFaqs || selectedFaqIds.size === 0) return;
    setBatchBusy(true);
    try {
      await Promise.all(
        [...selectedFaqIds].map((id) =>
          api.updateFaq(token, id, { isActive }),
        ),
      );
      clearSelectedFaqs();
      await load();
    } catch {
      /* ignore */
    } finally {
      setBatchBusy(false);
    }
  };

  const removeSelectedFaqs = async () => {
    if (!token || !canManageFaqs || selectedFaqIds.size === 0) return;
    const confirmed = window.confirm(
      `Excluir ${selectedFaqIds.size} FAQ(s) selecionada(s)?`,
    );
    if (!confirmed) return;

    setBatchBusy(true);
    try {
      await Promise.all([...selectedFaqIds].map((id) => api.deleteFaq(token, id)));
      clearSelectedFaqs();
      await load();
    } catch {
      /* ignore */
    } finally {
      setBatchBusy(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const firstVisibleItem = total === 0 ? 0 : (page - 1) * limit + 1;
  const lastVisibleItem = total === 0 ? 0 : Math.min(total, page * limit);
  const pageStart = Math.max(1, page - 2);
  const pageEnd = Math.min(totalPages, pageStart + 4);
  const visiblePages = Array.from(
    { length: Math.max(0, pageEnd - pageStart + 1) },
    (_, index) => pageStart + index,
  );

  return (
    <motion.div
      className="space-y-5"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <motion.div
        className="flex items-center justify-between"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        <div className="flex items-center gap-3">
          <motion.div
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10"
            whileHover={{ scale: 1.1, rotate: 5 }}
            whileTap={{ scale: 0.95 }}
          >
            <BookOpen className="h-5 w-5 text-primary" />
          </motion.div>
          <div>
            <h2 className="text-xl font-bold">Base de Conhecimento</h2>
            <p className="text-xs text-muted-foreground">
              FAQs ativas sao injetadas no prompt da IA automaticamente
            </p>
          </div>
        </div>
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <Button size="sm" onClick={() => setShowForm(true)} disabled={!canManageFaqs}>
            <Plus className="h-4 w-4 mr-1" /> Nova FAQ
          </Button>
        </motion.div>
      </motion.div>

      {!canManageFaqs && (
        <motion.p
          className="text-sm text-muted-foreground"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          Seu cargo pode consultar FAQs, mas nao criar, editar, ativar ou excluir.
        </motion.p>
      )}

      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0, scale: 0.95 }}
            animate={{ opacity: 1, height: "auto", scale: 1 }}
            exit={{ opacity: 0, height: 0, scale: 0.95 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
          >
            <Card className="border-primary/20 shadow-lg shadow-primary/5">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  {editingId ? "Editar FAQ" : "Nova FAQ"}
                </CardTitle>
                <CardDescription>
                  Preencha os campos para {editingId ? "atualizar" : "adicionar"} a FAQ
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label>Assunto</Label>
                    <Input
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Ex: Campeonato Valorant"
                      list="subject-suggestions"
                    />
                    <datalist id="subject-suggestions">
                      {subjects.map((s) => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                  </div>
                  <div className="space-y-1">
                    <Label>Edicao</Label>
                    <Input
                      value={edition}
                      onChange={(e) => setEdition(e.target.value)}
                      placeholder="Ex: 2025/1"
                      list="edition-suggestions"
                    />
                    <datalist id="edition-suggestions">
                      {editions.map((e) => (
                        <option key={e} value={e} />
                      ))}
                    </datalist>
                  </div>
                  <div className="space-y-1">
                    <Label>Tipo</Label>
                    <select
                      value={faqType}
                      onChange={(e) => setFaqType(e.target.value)}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      {FAQ_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Conteudo Complementar</Label>
                  <Textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Escreva o conteudo da FAQ, regras, links, observacoes e qualquer texto que a IA possa usar."
                    rows={6}
                    className="min-h-[160px] resize-y text-sm"
                  />
                </div>
                <div className="flex gap-2">
                  <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                    <Button
                      size="sm"
                      onClick={() => void save()}
                      disabled={!canManageFaqs || !content.trim()}
                    >
                      <Save className="h-4 w-4 mr-1" /> Salvar
                    </Button>
                  </motion.div>
                  <Button size="sm" variant="outline" onClick={resetForm}>
                    <X className="h-4 w-4 mr-1" /> Cancelar
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <Card>
          <CardContent className="grid gap-2 p-4 sm:grid-cols-5">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por conteudo, assunto ou texto"
            />
            <select
              value={activeFilter}
              onChange={(event) => setActiveFilter(event.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Todos status</option>
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </select>
            <select
              value={subjectFilter}
              onChange={(event) => setSubjectFilter(event.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Todos assuntos</option>
              {subjects.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              value={faqTypeFilter}
              onChange={(event) => setFaqTypeFilter(event.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Todos tipos</option>
              {FAQ_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-2 text-sm text-muted-foreground sm:justify-end">
              <Filter className="h-3.5 w-3.5" />
              {total} FAQ(s)
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {canManageFaqs && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="border-border/70">
            <CardContent className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleSelectVisibleFaqs}
                  disabled={!faqs.length || batchBusy}
                >
                  {allVisibleSelected ? "Limpar pagina" : "Selecionar pagina"}
                </Button>
                <span className="text-sm text-muted-foreground">
                  {selectedFaqIds.size > 0
                    ? `${selectedFaqIds.size} FAQ(s) selecionada(s)`
                    : "Use o botao redondo em cada card para selecionar varias FAQs"}
                </span>
              </div>
              {selectedFaqIds.size > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void applyBatchActiveState(true)}
                    disabled={batchBusy}
                  >
                    Ativar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void applyBatchActiveState(false)}
                    disabled={batchBusy}
                  >
                    Desativar
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => void removeSelectedFaqs()}
                    disabled={batchBusy}
                  >
                    Excluir
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={clearSelectedFaqs}
                    disabled={batchBusy}
                  >
                    Limpar
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      <motion.div
        className="space-y-2"
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.06 } } }}
      >
        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <motion.div
                key={i}
                className="rounded-xl border border-border/60 bg-card/50 p-4 space-y-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                <div className="h-4 w-2/3 rounded-md bg-muted/60" />
                <div className="h-3 w-full rounded-md bg-muted/60" />
              </motion.div>
            ))}
          </div>
        )}
        <AnimatePresence mode="popLayout">
          {faqs.map((faq) => (
            (() => {
              const isSelected = selectedFaqIds.has(faq.id);
              return (
            <motion.div
              key={faq.id}
              variants={listItem}
              exit="exit"
              layout
              transition={{ type: "spring", stiffness: 350, damping: 25 }}
            >
              <Card
                className={`group transition-colors duration-200 ${
                  isSelected
                    ? "border-primary/45 bg-primary/5"
                    : "hover:border-primary/30"
                }`}
              >
                <CardContent className="flex items-start gap-3 p-4">
                  {canManageFaqs && (
                    <button
                      type="button"
                      onClick={() => toggleFaqSelection(faq.id)}
                      aria-pressed={isSelected}
                      className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition ${
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground shadow-[0_0_0_4px_hsl(var(--primary)/0.12)]"
                          : "border-border/70 bg-background/70 text-muted-foreground hover:border-primary/45 hover:text-primary"
                      }`}
                      title={isSelected ? "Remover selecao" : "Selecionar FAQ"}
                    >
                      {isSelected ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <span className="h-2.5 w-2.5 rounded-full bg-current/45" />
                      )}
                    </button>
                  )}
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-base">{getFaqTitle(faq)}</p>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${typeColor[faq.faqType] ?? typeColor.other}`}
                      >
                        {FAQ_TYPES.find((t) => t.value === faq.faqType)?.label ?? faq.faqType}
                      </span>
                      {!faq.isActive && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-500/15 text-red-400">
                          Inativo
                        </span>
                        )}
                    </div>
                    <FaqBodyPreview content={getFaqBody(faq)} />
                    {(faq.subject || faq.edition) && (
                      <div className="flex items-center gap-3 text-xs text-muted-foreground/70 pt-0.5">
                        {faq.subject && (
                          <span className="bg-muted/40 px-2 py-0.5 rounded">
                            {faq.subject}
                          </span>
                        )}
                        {faq.edition && (
                          <span className="bg-muted/40 px-2 py-0.5 rounded">
                            Ed. {faq.edition}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
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
            </motion.div>
              );
            })()
          ))}
        </AnimatePresence>
        {!loading && !faqs.length && (
          <motion.p
            className="text-sm text-muted-foreground py-4 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            Nenhuma FAQ cadastrada. FAQs ativas sao injetadas automaticamente no prompt da IA.
          </motion.p>
        )}
      </motion.div>

      <motion.div
        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-card/40 px-3 py-3 text-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        <div className="space-y-1">
          <p className="text-muted-foreground">
            Pagina {page} de {totalPages}
          </p>
          <p className="text-xs text-muted-foreground/80">
            Mostrando {firstVisibleItem}-{lastVisibleItem} de {total} FAQ(s)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(1)}
          >
            Primeira
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Anterior
          </Button>
          <div className="flex items-center gap-1">
            {visiblePages.map((pageNumber) => (
              <Button
                key={pageNumber}
                variant={pageNumber === page ? "default" : "ghost"}
                size="sm"
                className="min-w-9"
                onClick={() => setPage(pageNumber)}
              >
                {pageNumber}
              </Button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() =>
              setPage((current) =>
                Math.min(totalPages, current + 1),
              )
            }
          >
            Proxima
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage(totalPages)}
          >
            Ultima
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
