import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Bot, Camera, KeyRound, Mail, Pencil, Plus, Save, Settings2, ShieldCheck, ShieldPlus, Trash2, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { api, type AiSettingsSummary, type CustomRoleSummary } from "@/lib/api";
import {
  PERMISSIONS,
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  ROLE_DESCRIPTIONS,
  ROLE_OPTIONS,
  ROLE_PERMISSIONS,
  type Permission,
  hasPermission,
} from "@/lib/rbac";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

const normalizeEmail = (value: string): string => value.trim().toLowerCase();
const sortRoles = (items: CustomRoleSummary[]): CustomRoleSummary[] =>
  items.slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

type RoleFormState = {
  id: string | null;
  name: string;
  description: string;
  permissions: Permission[];
};

type AiSettingsFormState = {
  model: string;
  language: string;
  personality: string;
  style: string;
  systemPrompt: string;
};

type AiModelOption = {
  value: string;
  label: string;
  hint: string;
};

const emptyRoleForm: RoleFormState = { id: null, name: "", description: "", permissions: [] };
const emptyAiSettingsForm: AiSettingsFormState = {
  model: "",
  language: "",
  personality: "",
  style: "",
  systemPrompt: "",
};

const AI_MODEL_OPTIONS: AiModelOption[] = [
  {
    value: "gpt-5.4",
    label: "GPT-5.4",
    hint: "Maior capacidade para triagem complexa, contexto longo e respostas mais consistentes.",
  },
  {
    value: "gpt-5.4-mini",
    label: "GPT-5.4 mini",
    hint: "Equilibrio forte entre qualidade, custo e velocidade para atendimento recorrente.",
  },
  {
    value: "gpt-5.4-nano",
    label: "GPT-5.4 nano",
    hint: "Opcao mais barata para alto volume e fluxos simples de triagem.",
  },
  {
    value: "gpt-4.1",
    label: "GPT-4.1",
    hint: "Boa escolha para respostas detalhadas e uso intensivo de instrucoes.",
  },
  {
    value: "gpt-4.1-mini",
    label: "GPT-4.1 mini",
    hint: "Versao mais economica do GPT-4.1 para operacao continua.",
  },
  {
    value: "gpt-4o",
    label: "GPT-4o",
    hint: "Modelo versatil para respostas naturais e bom equilibrio geral.",
  },
  {
    value: "gpt-4o-mini",
    label: "GPT-4o mini",
    hint: "Opcao leve para manter latencia baixa no WhatsApp.",
  },
];

const toAiForm = (settings: AiSettingsSummary): AiSettingsFormState => ({
  model: settings.model,
  language: settings.language,
  personality: settings.personality,
  style: settings.style,
  systemPrompt: settings.systemPrompt ?? "",
});

export default function SettingsPage() {
  const { user, token, refreshUser } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [savingAccount, setSavingAccount] = useState(false);

  const [aiForm, setAiForm] = useState<AiSettingsFormState>(emptyAiSettingsForm);
  const [aiMeta, setAiMeta] = useState<Pick<AiSettingsSummary, "source" | "updatedAt">>({
    source: "environment",
    updatedAt: null,
  });
  const [loadingAi, setLoadingAi] = useState(false);
  const [savingAi, setSavingAi] = useState(false);
  const [botEnabled, setBotEnabled] = useState(true);
  const [togglingBot, setTogglingBot] = useState(false);

  const [customRoles, setCustomRoles] = useState<CustomRoleSummary[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [savingRole, setSavingRole] = useState(false);
  const [deletingRoleId, setDeletingRoleId] = useState<string | null>(null);
  const [roleForm, setRoleForm] = useState<RoleFormState>(emptyRoleForm);

  const canManageUsers = hasPermission(user, PERMISSIONS.USERS_MANAGE);

  useEffect(() => {
    if (!user) return;
    setName(user.name ?? "");
    setEmail(user.email);
  }, [user]);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview(null);
      return;
    }
    const objectUrl = URL.createObjectURL(avatarFile);
    setAvatarPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [avatarFile]);

  useEffect(() => {
    if (!token || !canManageUsers) return;
    let cancelled = false;
    const loadAi = async () => {
      setLoadingAi(true);
      try {
        const settings = await api.aiSettings(token);
        if (cancelled) return;
        setAiForm(toAiForm(settings));
        setAiMeta({ source: settings.source, updatedAt: settings.updatedAt });
        setBotEnabled(settings.botEnabled);
      } catch (error) {
        if (!cancelled) {
          toast({
            title: "Falha ao carregar configuracoes da IA",
            description: error instanceof Error ? error.message : "Tente novamente.",
            variant: "error",
          });
        }
      } finally {
        if (!cancelled) setLoadingAi(false);
      }
    };
    void loadAi();
    return () => {
      cancelled = true;
    };
  }, [token, canManageUsers, toast]);

  useEffect(() => {
    if (!token || !canManageUsers) return;
    let cancelled = false;
    const loadRoles = async () => {
      setLoadingRoles(true);
      try {
        const items = await api.customRoles(token);
        if (!cancelled) setCustomRoles(sortRoles(items));
      } catch (error) {
        if (!cancelled) {
          toast({
            title: "Falha ao carregar cargos",
            description: error instanceof Error ? error.message : "Tente novamente.",
            variant: "error",
          });
        }
      } finally {
        if (!cancelled) setLoadingRoles(false);
      }
    };
    void loadRoles();
    return () => {
      cancelled = true;
    };
  }, [token, canManageUsers, toast]);

  const permissionsByGroup = useMemo(
    () =>
      PERMISSION_GROUPS.map((group) => ({
        ...group,
        items: group.permissions.filter((permission) => user?.permissions.includes(permission)),
      })).filter((group) => group.items.length > 0),
    [user],
  );

  const aiModelOptions = useMemo(() => {
    const currentModel = aiForm.model.trim();
    if (!currentModel || AI_MODEL_OPTIONS.some((option) => option.value === currentModel)) {
      return AI_MODEL_OPTIONS;
    }

    return [
      {
        value: currentModel,
        label: `${currentModel} (atual)`,
        hint: "Modelo carregado das configuracoes atuais e mantido por compatibilidade.",
      },
      ...AI_MODEL_OPTIONS,
    ];
  }, [aiForm.model]);

  const selectedAiModel = aiModelOptions.find((option) => option.value === aiForm.model.trim()) ?? null;

  if (!user || !token) return null;

  const normalizedEmail = normalizeEmail(email);
  const wantsSensitiveChange = normalizedEmail !== user.email || newPassword.length > 0;
  const displayAvatar = avatarPreview ?? user.avatarUrl;
  const initials = (user.name ?? user.email).slice(0, 2).toUpperCase();
  const aiStatus = aiMeta.source === "database" ? "Configuracao salva no painel" : "Usando fallback do .env";
  const aiUpdatedAt = aiMeta.updatedAt ? new Date(aiMeta.updatedAt).toLocaleString("pt-BR") : null;

  const handleAvatarChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Selecione uma imagem valida", variant: "error" });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Imagem muito grande (max 2 MB)", variant: "error" });
      return;
    }
    setAvatarFile(file);
  };

  const handleAccountSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!normalizedEmail.includes("@")) {
      toast({ title: "Informe um email valido", variant: "error" });
      return;
    }
    if (newPassword.length > 0 && newPassword.length < 6) {
      toast({ title: "A nova senha deve ter ao menos 6 caracteres", variant: "error" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "A confirmacao da senha nao confere", variant: "error" });
      return;
    }
    if (wantsSensitiveChange && !currentPassword) {
      toast({
        title: "Informe sua senha atual",
        description: "Ela e obrigatoria para alterar email ou senha.",
        variant: "error",
      });
      return;
    }
    setSavingAccount(true);
    try {
      await api.updateProfile(token, {
        name: name.trim(),
        email: normalizedEmail,
        currentPassword: currentPassword || undefined,
        newPassword: newPassword || undefined,
        avatar: avatarFile,
      });
      await refreshUser();
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setAvatarFile(null);
      setAvatarPreview(null);
      toast({ title: "Configuracoes atualizadas", description: "Seus dados de acesso foram salvos.", variant: "success" });
    } catch (error) {
      toast({
        title: "Falha ao salvar configuracoes",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "error",
      });
    } finally {
      setSavingAccount(false);
    }
  };

  const handleAiSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (aiForm.model.trim().length < 2 || aiForm.language.trim().length < 2) {
      toast({ title: "Preencha modelo e idioma corretamente", variant: "error" });
      return;
    }
    if (aiForm.personality.trim().length < 5 || aiForm.style.trim().length < 5) {
      toast({ title: "Descreva melhor a personalidade e o estilo da IA", variant: "error" });
      return;
    }
    setSavingAi(true);
    try {
      const saved = await api.updateAiSettings(token, {
        model: aiForm.model.trim(),
        language: aiForm.language.trim(),
        personality: aiForm.personality.trim(),
        style: aiForm.style.trim(),
        systemPrompt: aiForm.systemPrompt.trim() || null,
      });
      setAiForm(toAiForm(saved));
      setAiMeta({ source: saved.source, updatedAt: saved.updatedAt });
      setBotEnabled(saved.botEnabled);
      toast({
        title: "Configuracoes da IA salvas",
        description: "As proximas respostas ja usarao esse perfil.",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Falha ao salvar configuracoes da IA",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "error",
      });
    } finally {
      setSavingAi(false);
    }
  };

  const handleToggleBot = async () => {
    if (!token) return;
    const next = !botEnabled;
    setTogglingBot(true);
    try {
      const saved = await api.setAiBotEnabled(token, next);
      setBotEnabled(saved.botEnabled);
      setAiMeta({ source: saved.source, updatedAt: saved.updatedAt });
      toast({
        title: saved.botEnabled ? "Bot ativado" : "Bot desativado",
        description: saved.botEnabled
          ? "A IA voltara a responder automaticamente."
          : "A IA nao respondera mais ninguem ate ser reativada.",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Falha ao alterar status do bot",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "error",
      });
    } finally {
      setTogglingBot(false);
    }
  };

  const handleRoleSubmit = async () => {
    if (roleForm.name.trim().length < 2) {
      toast({ title: "Nome do cargo invalido", description: "Use ao menos 2 caracteres.", variant: "error" });
      return;
    }
    if (roleForm.permissions.length === 0) {
      toast({ title: "Selecione permissoes", description: "O cargo precisa ter ao menos uma permissao.", variant: "error" });
      return;
    }
    setSavingRole(true);
    try {
      const payload = {
        name: roleForm.name.trim(),
        description: roleForm.description.trim() || undefined,
        permissions: roleForm.permissions,
      };
      const saved = roleForm.id
        ? await api.updateCustomRole(token, roleForm.id, payload)
        : await api.createCustomRole(token, payload);
      setCustomRoles((current) => sortRoles([...current.filter((role) => role.id !== saved.id), saved]));
      setRoleForm(emptyRoleForm);
      toast({
        title: roleForm.id ? "Cargo atualizado" : "Cargo criado",
        description: "As permissoes selecionadas foram salvas.",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Falha ao salvar cargo",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "error",
      });
    } finally {
      setSavingRole(false);
    }
  };

  const handleDeleteRole = async (role: CustomRoleSummary) => {
    if (!window.confirm(`Excluir o cargo "${role.name}"?`)) return;
    setDeletingRoleId(role.id);
    try {
      await api.deleteCustomRole(token, role.id);
      setCustomRoles((current) => current.filter((item) => item.id !== role.id));
      if (roleForm.id === role.id) setRoleForm(emptyRoleForm);
      toast({ title: "Cargo removido", description: "O cargo personalizado foi excluido.", variant: "success" });
    } catch (error) {
      toast({
        title: "Falha ao excluir cargo",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "error",
      });
    } finally {
      setDeletingRoleId(null);
    }
  };

  return (
    <motion.div className="space-y-5" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: "easeOut" }}>
      <div className="space-y-1">
        <h2 className="text-xl font-bold">Configuracoes</h2>
        <p className="text-sm text-muted-foreground">
          Ajuste sua conta e, se tiver permissao, personalize o comportamento da IA e dos cargos.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <div className="h-24 bg-[radial-gradient(circle_at_top_left,_rgba(6,182,212,0.35),_transparent_55%),linear-gradient(135deg,rgba(8,14,24,0.96),rgba(16,24,40,0.9))]" />
            <CardContent className="-mt-10 space-y-4 pt-0">
              <div className="flex items-end justify-between gap-3">
                <button type="button" className="group relative" onClick={() => fileInputRef.current?.click()}>
                  <Avatar className="h-24 w-24 border-4 border-background shadow-xl">
                    {displayAvatar ? <AvatarImage src={displayAvatar} alt="Avatar do usuario" /> : null}
                    <AvatarFallback className="bg-primary text-lg font-semibold text-primary-foreground">{initials}</AvatarFallback>
                  </Avatar>
                  <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
                    <Camera className="h-5 w-5 text-white" />
                  </span>
                </button>
                <Button type="button" size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
                  Trocar foto
                </Button>
              </div>

              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />

              <div className="space-y-1">
                <h3 className="text-lg font-semibold">{user.name ?? "Usuario"}</h3>
                <p className="text-sm text-muted-foreground">{user.email}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{user.roleLabel}</Badge>
                <Badge variant="outline">{user.permissions.length} permissoes ativas</Badge>
              </div>

              <p className="text-sm text-muted-foreground">
                {user.customRole?.description ?? ROLE_DESCRIPTIONS[user.role]}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Permissoes do seu acesso
              </CardTitle>
              <CardDescription>Resumo do que o seu login pode executar no painel.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {permissionsByGroup.map((group) => (
                <div key={group.title} className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{group.title}</p>
                  <div className="flex flex-wrap gap-2">
                    {group.items.map((permission) => (
                      <Badge key={permission} variant="secondary" className="font-normal">
                        {PERMISSION_LABELS[permission]}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="account" className="space-y-4">
          <TabsList className="h-auto w-full flex-wrap justify-start gap-2 rounded-xl border border-border/60 bg-background/70 p-1">
            <TabsTrigger value="account">Minha conta</TabsTrigger>
            {canManageUsers && <TabsTrigger value="ai">IA</TabsTrigger>}
            {canManageUsers && <TabsTrigger value="roles">Cargos</TabsTrigger>}
          </TabsList>

          <TabsContent value="account" className="mt-0">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings2 className="h-5 w-5 text-primary" />
                  Minha conta
                </CardTitle>
                <CardDescription>
                  Altere nome, email e senha. Para trocar email ou senha, confirme sua senha atual.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAccountSubmit} className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="settings-name">Nome</Label>
                    <Input id="settings-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Seu nome no painel" disabled={savingAccount} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="settings-email" className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-primary" />
                      Email
                    </Label>
                    <Input id="settings-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@empresa.com" disabled={savingAccount} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="settings-current-password">Senha atual</Label>
                    <Input id="settings-current-password" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="Obrigatoria para trocar email ou senha" disabled={savingAccount} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="settings-new-password" className="flex items-center gap-2">
                      <KeyRound className="h-4 w-4 text-primary" />
                      Nova senha
                    </Label>
                    <Input id="settings-new-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="Minimo 6 caracteres" disabled={savingAccount} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="settings-confirm-password">Confirmar nova senha</Label>
                    <Input id="settings-confirm-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repita a nova senha" disabled={savingAccount} />
                  </div>
                  <div className="md:col-span-2 flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-sm text-muted-foreground">
                    <span>
                      Cargo atual: <strong className="text-foreground">{user.roleLabel}</strong>
                    </span>
                    <span>{wantsSensitiveChange ? "Senha atual obrigatoria" : "Alteracao simples"}</span>
                  </div>
                  <div className="md:col-span-2 flex justify-end">
                    <Button type="submit" disabled={savingAccount}>
                      <Save className="h-4 w-4" />
                      {savingAccount ? "Salvando..." : "Salvar configuracoes"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
          {canManageUsers && (
            <TabsContent value="ai" className="mt-0">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Bot className="h-5 w-5 text-primary" />
                    Configuracoes da IA
                  </CardTitle>
                  <CardDescription>Defina o perfil global usado nas proximas respostas do assistente.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{aiStatus}</Badge>
                    {aiUpdatedAt && <Badge variant="outline">Atualizado em {aiUpdatedAt}</Badge>}
                    <Badge
                      variant="outline"
                      className={botEnabled ? "" : "border-destructive text-destructive"}
                    >
                      {botEnabled ? "Bot ativo" : "Bot desativado"}
                    </Badge>
                  </div>
                  <div className="flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-background/50 px-3 py-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Responder automaticamente</p>
                      <p className="text-xs text-muted-foreground">
                        {botEnabled
                          ? "A IA esta respondendo novas mensagens recebidas."
                          : "A IA nao respondera ninguem enquanto estiver desativada."}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant={botEnabled ? "destructive" : "default"}
                      onClick={handleToggleBot}
                      disabled={togglingBot || loadingAi}
                    >
                      {togglingBot
                        ? "Aplicando..."
                        : botEnabled
                          ? "Desativar bot"
                          : "Ativar bot"}
                    </Button>
                  </div>
                  {loadingAi ? (
                    <p className="text-sm text-muted-foreground">Carregando configuracoes da IA...</p>
                  ) : (
                    <form onSubmit={handleAiSubmit} className="space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="ai-model">Modelo</Label>
                          <Select
                            value={aiForm.model || undefined}
                            onValueChange={(value) => setAiForm((current) => ({ ...current, model: value }))}
                            disabled={savingAi}
                          >
                            <SelectTrigger id="ai-model">
                              <SelectValue placeholder="Selecione o modelo da IA" />
                            </SelectTrigger>
                            <SelectContent>
                              {aiModelOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            {selectedAiModel?.hint ?? "Escolha o modelo global usado em respostas, triagem e extracao."}
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="ai-language">Idioma principal</Label>
                          <Input id="ai-language" value={aiForm.language} onChange={(event) => setAiForm((current) => ({ ...current, language: event.target.value }))} placeholder="pt-BR" disabled={savingAi} />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="ai-personality">Personalidade</Label>
                        <Textarea id="ai-personality" value={aiForm.personality} onChange={(event) => setAiForm((current) => ({ ...current, personality: event.target.value }))} placeholder="Ex.: consultiva, direta, acolhedora e segura." disabled={savingAi} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="ai-style">Estilo de resposta</Label>
                        <Textarea id="ai-style" value={aiForm.style} onChange={(event) => setAiForm((current) => ({ ...current, style: event.target.value }))} placeholder="Ex.: respostas curtas, objetivas e com proximo passo claro." disabled={savingAi} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="ai-system-prompt">Prompt base opcional</Label>
                        <Textarea id="ai-system-prompt" className="min-h-[180px]" value={aiForm.systemPrompt} onChange={(event) => setAiForm((current) => ({ ...current, systemPrompt: event.target.value }))} placeholder="Ex.: Priorize responder com base nas FAQs do campeonato recuperadas no contexto. Use assunto, edicao, pergunta, resposta e detalhes para localizar a melhor resposta. Se a base nao trouxer a informacao, diga isso claramente sem inventar." disabled={savingAi} />
                        <p className="text-xs text-muted-foreground mt-2">
                          O texto salvo aqui e complementar: o backend ainda aplica regras fixas para priorizar FAQs recuperadas e evitar respostas inventadas.
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Se o prompt base estiver preenchido, ele orienta o comportamento da IA, mas continua combinado com regras fixas de recuperacao e seguranca.
                        </p>
                      </div>
                      <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-sm text-muted-foreground">
                        <span>As alteracoes valem para novas respostas sem depender do `.env`.</span>
                        <Button type="submit" disabled={savingAi}>
                          <Save className="h-4 w-4" />
                          {savingAi ? "Salvando..." : "Salvar configuracoes da IA"}
                        </Button>
                      </div>
                    </form>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {canManageUsers && (
            <TabsContent value="roles" className="mt-0 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShieldPlus className="h-5 w-5 text-primary" />
                    Criador de cargo
                  </CardTitle>
                  <CardDescription>Monte um cargo personalizado escolhendo exatamente o que cada usuario podera acessar.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="custom-role-name">Nome do cargo</Label>
                      <Input id="custom-role-name" value={roleForm.name} onChange={(event) => setRoleForm((current) => ({ ...current, name: event.target.value }))} placeholder="Ex.: Comercial Senior" disabled={savingRole} />
                    </div>
                    <div className="space-y-2">
                      <Label>Base rapida</Label>
                      <div className="flex flex-wrap gap-2">
                        {ROLE_OPTIONS.map((role) => (
                          <Button key={role.value} type="button" size="sm" variant="outline" onClick={() => setRoleForm((current) => ({ ...current, permissions: ROLE_PERMISSIONS[role.value] }))} disabled={savingRole}>
                            {role.label}
                          </Button>
                        ))}
                        <Button type="button" size="sm" variant="ghost" onClick={() => setRoleForm((current) => ({ ...current, permissions: [] }))} disabled={savingRole}>
                          Limpar
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="custom-role-description">Descricao</Label>
                    <Textarea id="custom-role-description" value={roleForm.description} onChange={(event) => setRoleForm((current) => ({ ...current, description: event.target.value }))} placeholder="Explique para que esse cargo serve." disabled={savingRole} />
                  </div>
                  <div className="space-y-4">
                    {PERMISSION_GROUPS.map((group) => (
                      <div key={group.title} className="rounded-xl border border-border/60 bg-background/40 p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium">{group.title}</p>
                            <p className="text-xs text-muted-foreground">Selecione as permissoes liberadas nesse bloco.</p>
                          </div>
                          <Badge variant="outline">
                            {group.permissions.filter((permission) => roleForm.permissions.includes(permission)).length}/{group.permissions.length}
                          </Badge>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          {group.permissions.map((permission) => (
                            <Checkbox
                              key={permission}
                              checked={roleForm.permissions.includes(permission)}
                              onCheckedChange={() =>
                                setRoleForm((current) => ({
                                  ...current,
                                  permissions: current.permissions.includes(permission)
                                    ? current.permissions.filter((item) => item !== permission)
                                    : [...current.permissions, permission],
                                }))
                              }
                              label={PERMISSION_LABELS[permission]}
                              disabled={savingRole}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-sm text-muted-foreground">
                    <span>{roleForm.permissions.length} permissoes selecionadas</span>
                    <div className="flex gap-2">
                      {roleForm.id && (
                        <Button type="button" variant="ghost" onClick={() => setRoleForm(emptyRoleForm)} disabled={savingRole}>
                          <X className="h-4 w-4" />
                          Cancelar edicao
                        </Button>
                      )}
                      <Button type="button" onClick={() => void handleRoleSubmit()} disabled={savingRole}>
                        {roleForm.id ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                        {savingRole ? "Salvando..." : roleForm.id ? "Atualizar cargo" : "Criar cargo"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Cargos personalizados</CardTitle>
                  <CardDescription>Edite ou remova os cargos criados manualmente.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {loadingRoles ? (
                    <p className="text-sm text-muted-foreground">Carregando cargos...</p>
                  ) : customRoles.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum cargo personalizado criado ainda.</p>
                  ) : (
                    customRoles.map((role) => (
                      <div key={role.id} className="rounded-xl border border-border/60 bg-background/40 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-semibold">{role.name}</h3>
                              <Badge variant="outline">{role.usersCount} usuarios</Badge>
                              <Badge variant="outline">{role.permissions.length} permissoes</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">{role.description || "Sem descricao informada."}</p>
                          </div>
                          <div className="flex gap-2">
                            <Button type="button" size="sm" variant="outline" onClick={() => setRoleForm({ id: role.id, name: role.name, description: role.description ?? "", permissions: role.permissions })}>
                              <Pencil className="h-4 w-4" />
                              Editar
                            </Button>
                            <Button type="button" size="sm" variant="outline" disabled={deletingRoleId === role.id} onClick={() => void handleDeleteRole(role)}>
                              <Trash2 className="h-4 w-4" />
                              {deletingRoleId === role.id ? "Excluindo..." : "Excluir"}
                            </Button>
                          </div>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {role.permissions.map((permission) => (
                            <Badge key={`${role.id}-${permission}`} variant="secondary" className="font-normal">
                              {PERMISSION_LABELS[permission]}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </motion.div>
  );
}
