import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  Camera,
  KeyRound,
  Mail,
  Pencil,
  Plus,
  Save,
  Settings2,
  ShieldCheck,
  ShieldPlus,
  Trash2,
  X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { api, type CustomRoleSummary } from "@/lib/api";
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
import { Textarea } from "@/components/ui/textarea";

const normalizeEmail = (value: string): string => value.trim().toLowerCase();

interface RoleFormState {
  id: string | null;
  name: string;
  description: string;
  permissions: Permission[];
}

const emptyRoleForm: RoleFormState = {
  id: null,
  name: "",
  description: "",
  permissions: [],
};

const sortRoles = (items: CustomRoleSummary[]): CustomRoleSummary[] =>
  items.slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

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
  const [saving, setSaving] = useState(false);

  const [customRoles, setCustomRoles] = useState<CustomRoleSummary[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [roleSaving, setRoleSaving] = useState(false);
  const [deletingRoleId, setDeletingRoleId] = useState<string | null>(null);
  const [roleForm, setRoleForm] = useState<RoleFormState>(emptyRoleForm);

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

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [avatarFile]);

  const canManageUsers = hasPermission(user, PERMISSIONS.USERS_MANAGE);

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

  if (!user || !token) return null;

  const normalizedEmail = normalizeEmail(email);
  const wantsSensitiveChange =
    normalizedEmail !== user.email || newPassword.length > 0;
  const displayAvatar = avatarPreview ?? user.avatarUrl;
  const initials = (user.name ?? user.email).slice(0, 2).toUpperCase();

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

  const handleSubmit = async (event: FormEvent) => {
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

    setSaving(true);
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
      toast({
        title: "Configuracoes atualizadas",
        description: "Seus dados de acesso foram salvos.",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Falha ao salvar configuracoes",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleRolePermission = (permission: Permission) => {
    setRoleForm((current) => ({
      ...current,
      permissions: current.permissions.includes(permission)
        ? current.permissions.filter((item) => item !== permission)
        : [...current.permissions, permission],
    }));
  };

  const applyPresetPermissions = (permissions: Permission[]) => {
    setRoleForm((current) => ({
      ...current,
      permissions,
    }));
  };

  const resetRoleForm = () => {
    setRoleForm(emptyRoleForm);
  };

  const handleRoleSubmit = async () => {
    if (!token) return;

    if (roleForm.name.trim().length < 2) {
      toast({
        title: "Nome do cargo invalido",
        description: "Use ao menos 2 caracteres.",
        variant: "error",
      });
      return;
    }

    if (roleForm.permissions.length === 0) {
      toast({
        title: "Selecione permissoes",
        description: "O cargo precisa ter ao menos uma permissao.",
        variant: "error",
      });
      return;
    }

    setRoleSaving(true);
    try {
      const payload = {
        name: roleForm.name.trim(),
        description: roleForm.description.trim() || undefined,
        permissions: roleForm.permissions,
      };

      const saved = roleForm.id
        ? await api.updateCustomRole(token, roleForm.id, payload)
        : await api.createCustomRole(token, payload);

      setCustomRoles((current) =>
        sortRoles([
          ...current.filter((role) => role.id !== saved.id),
          saved,
        ]),
      );
      resetRoleForm();
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
      setRoleSaving(false);
    }
  };

  const handleEditRole = (role: CustomRoleSummary) => {
    setRoleForm({
      id: role.id,
      name: role.name,
      description: role.description ?? "",
      permissions: role.permissions,
    });
  };

  const handleDeleteRole = async (role: CustomRoleSummary) => {
    if (!token) return;
    if (!window.confirm(`Excluir o cargo "${role.name}"?`)) return;

    setDeletingRoleId(role.id);
    try {
      await api.deleteCustomRole(token, role.id);
      setCustomRoles((current) => current.filter((item) => item.id !== role.id));
      if (roleForm.id === role.id) resetRoleForm();
      toast({
        title: "Cargo removido",
        description: "O cargo personalizado foi excluido.",
        variant: "success",
      });
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
    <div className="stagger space-y-5">
      <div className="space-y-1">
        <h2 className="text-xl font-bold">Configuracoes</h2>
        <p className="text-sm text-muted-foreground">
          Atualize sua conta e, se tiver permissao, monte cargos personalizados com checkbox.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <div className="h-24 bg-[radial-gradient(circle_at_top_left,_rgba(6,182,212,0.35),_transparent_55%),linear-gradient(135deg,rgba(8,14,24,0.96),rgba(16,24,40,0.9))]" />
            <CardContent className="-mt-10 space-y-4 pt-0">
              <div className="flex items-end justify-between gap-3">
                <button
                  type="button"
                  className="group relative"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Avatar className="h-24 w-24 border-4 border-background shadow-xl">
                    {displayAvatar ? <AvatarImage src={displayAvatar} alt="Avatar do usuario" /> : null}
                    <AvatarFallback className="bg-primary text-lg font-semibold text-primary-foreground">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
                    <Camera className="h-5 w-5 text-white" />
                  </span>
                </button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Trocar foto
                </Button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />

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
              <CardDescription>
                Resumo do que o seu login pode executar no painel.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {permissionsByGroup.map((group) => (
                <div key={group.title} className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    {group.title}
                  </p>
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

        <div className="space-y-4">
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
              <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="settings-name">Nome</Label>
                  <Input
                    id="settings-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Seu nome no painel"
                    disabled={saving}
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="settings-email" className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-primary" />
                    Email
                  </Label>
                  <Input
                    id="settings-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="voce@empresa.com"
                    disabled={saving}
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="settings-current-password">Senha atual</Label>
                  <Input
                    id="settings-current-password"
                    type="password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    placeholder="Obrigatoria para trocar email ou senha"
                    disabled={saving}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="settings-new-password" className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-primary" />
                    Nova senha
                  </Label>
                  <Input
                    id="settings-new-password"
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder="Minimo 6 caracteres"
                    disabled={saving}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="settings-confirm-password">Confirmar nova senha</Label>
                  <Input
                    id="settings-confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Repita a nova senha"
                    disabled={saving}
                  />
                </div>

                <div className="md:col-span-2 flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-sm text-muted-foreground">
                  <span>
                    Cargo atual: <strong className="text-foreground">{user.roleLabel}</strong>
                  </span>
                  <span>{wantsSensitiveChange ? "Senha atual obrigatoria" : "Alteracao simples"}</span>
                </div>

                <div className="md:col-span-2 flex justify-end">
                  <Button type="submit" disabled={saving}>
                    <Save className="h-4 w-4" />
                    {saving ? "Salvando..." : "Salvar configuracoes"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {canManageUsers && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShieldPlus className="h-5 w-5 text-primary" />
                    Criador de cargo
                  </CardTitle>
                  <CardDescription>
                    Monte um cargo personalizado escolhendo exatamente o que cada usuario podera acessar.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="custom-role-name">Nome do cargo</Label>
                      <Input
                        id="custom-role-name"
                        value={roleForm.name}
                        onChange={(event) =>
                          setRoleForm((current) => ({ ...current, name: event.target.value }))
                        }
                        placeholder="Ex.: Comercial Senior"
                        disabled={roleSaving}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Base rapida</Label>
                      <div className="flex flex-wrap gap-2">
                        {ROLE_OPTIONS.map((role) => (
                          <Button
                            key={role.value}
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => applyPresetPermissions(ROLE_PERMISSIONS[role.value])}
                            disabled={roleSaving}
                          >
                            {role.label}
                          </Button>
                        ))}
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => applyPresetPermissions([])}
                          disabled={roleSaving}
                        >
                          Limpar
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="custom-role-description">Descricao</Label>
                    <Textarea
                      id="custom-role-description"
                      value={roleForm.description}
                      onChange={(event) =>
                        setRoleForm((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                      placeholder="Explique para que esse cargo serve."
                      disabled={roleSaving}
                    />
                  </div>

                  <div className="space-y-4">
                    {PERMISSION_GROUPS.map((group) => (
                      <div
                        key={group.title}
                        className="rounded-xl border border-border/60 bg-background/40 p-4"
                      >
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium">{group.title}</p>
                            <p className="text-xs text-muted-foreground">
                              Selecione as permissoes liberadas nesse bloco.
                            </p>
                          </div>
                          <Badge variant="outline">
                            {
                              group.permissions.filter((permission) =>
                                roleForm.permissions.includes(permission),
                              ).length
                            }
                            /{group.permissions.length}
                          </Badge>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          {group.permissions.map((permission) => (
                            <Checkbox
                              key={permission}
                              checked={roleForm.permissions.includes(permission)}
                              onCheckedChange={() => toggleRolePermission(permission)}
                              label={PERMISSION_LABELS[permission]}
                              disabled={roleSaving}
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
                        <Button type="button" variant="ghost" onClick={resetRoleForm} disabled={roleSaving}>
                          <X className="h-4 w-4" />
                          Cancelar edicao
                        </Button>
                      )}
                      <Button type="button" onClick={() => void handleRoleSubmit()} disabled={roleSaving}>
                        {roleForm.id ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                        {roleSaving
                          ? "Salvando..."
                          : roleForm.id
                            ? "Atualizar cargo"
                            : "Criar cargo"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Cargos personalizados</CardTitle>
                  <CardDescription>
                    Edite ou remova os cargos criados manualmente.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {loadingRoles ? (
                    <p className="text-sm text-muted-foreground">Carregando cargos...</p>
                  ) : customRoles.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nenhum cargo personalizado criado ainda.
                    </p>
                  ) : (
                    customRoles.map((role) => (
                      <div
                        key={role.id}
                        className="rounded-xl border border-border/60 bg-background/40 p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-semibold">{role.name}</h3>
                              <Badge variant="outline">{role.usersCount} usuarios</Badge>
                              <Badge variant="outline">{role.permissions.length} permissoes</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {role.description || "Sem descricao informada."}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => handleEditRole(role)}
                            >
                              <Pencil className="h-4 w-4" />
                              Editar
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={deletingRoleId === role.id}
                              onClick={() => void handleDeleteRole(role)}
                            >
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
            </>
          )}

          {!canManageUsers && (
            <Card>
              <CardHeader>
                <CardTitle>Gestao de cargos</CardTitle>
                <CardDescription>
                  O criador de cargos personalizados fica disponivel apenas para quem gerencia usuarios.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Seu acesso atual pode consultar permissoes, mas nao criar ou editar cargos.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
