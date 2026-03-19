import { useCallback, useEffect, useState } from "react";
import {
  BookOpen,
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

const listItem = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, x: -30, scale: 0.95 },
};

export default function FaqsPage() {
  const { token, user } = useAuth();
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [total, setTotal] = useState(0);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [editions, setEditions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [subject, setSubject] = useState("");
  const [edition, setEdition] = useState("");
  const [faqType, setFaqType] = useState<string>("general");
  const [content, setContent] = useState("");
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [faqTypeFilter, setFaqTypeFilter] = useState("");
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
    setQuestion("");
    setAnswer("");
    setSubject("");
    setEdition("");
    setFaqType("general");
    setContent("");
  };

  const startEdit = (faq: Faq) => {
    setEditingId(faq.id);
    setQuestion(faq.question);
    setAnswer(faq.answer);
    setSubject(faq.subject ?? "");
    setEdition(faq.edition ?? "");
    setFaqType(faq.faqType ?? "general");
    setContent(faq.content ?? "");
    setShowForm(true);
  };

  const save = async () => {
    if (!token || !question.trim() || !answer.trim() || !canManageFaqs) return;
    try {
      const payload = {
        question,
        answer,
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
      await load();
    } catch {
      /* ignore */
    }
  };

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
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Pergunta *</Label>
                    <Input
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      placeholder="Ex: Qual o horario do campeonato?"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Resposta *</Label>
                    <Input
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      placeholder="Ex: O campeonato acontece todos os sabados as 14h."
                    />
                  </div>
                </div>
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
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Informacoes adicionais, regras, links, etc."
                    rows={3}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                  />
                </div>
                <div className="flex gap-2">
                  <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                    <Button size="sm" onClick={() => void save()} disabled={!canManageFaqs}>
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
              placeholder="Buscar por pergunta ou resposta"
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
            <motion.div
              key={faq.id}
              variants={listItem}
              exit="exit"
              layout
              transition={{ type: "spring", stiffness: 350, damping: 25 }}
            >
              <Card className="group hover:border-primary/30 transition-colors duration-200">
                <CardContent className="flex items-start gap-3 p-4">
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-base">{faq.question}</p>
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
                    <p className="text-sm text-muted-foreground">{faq.answer}</p>
                    {(faq.subject || faq.edition || faq.content) && (
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
                        {faq.content && (
                          <span className="truncate max-w-[200px]" title={faq.content}>
                            {faq.content}
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
        className="flex items-center justify-between rounded-lg border border-border/70 bg-card/40 px-3 py-2 text-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
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
      </motion.div>
    </motion.div>
  );
}
