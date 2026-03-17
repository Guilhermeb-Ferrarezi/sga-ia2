import { useEffect, useMemo, useState } from "react";
import { ShieldPlus, UserPlus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { api, type CustomRoleSummary } from "@/lib/api";
import {
  PERMISSIONS,
  ROLE_OPTIONS,
  type PresetUserRole,
  hasPermission,
} from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import AccessDenied from "@/components/auth/AccessDenied";

interface FormState {
  name: string;
  email: string;
  password: string;
  roleSelection: string;
}

const initialForm: FormState = {
  name: "",
  email: "",
  password: "",
  roleSelection: "preset:AGENT",
};

export default function CreateUserPage() {
  const { token, user } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(initialForm);
  const [customRoles, setCustomRoles] = useState<CustomRoleSummary[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const canManageUsers = hasPermission(user, PERMISSIONS.USERS_MANAGE);

  useEffect(() => {
    if (!token || !canManageUsers) return;

    let cancelled = false;
    const loadRoles = async () => {
      setLoadingRoles(true);
      try {
        const items = await api.customRoles(token);
        if (!cancelled) setCustomRoles(items);
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

  const selectedPresetRole = useMemo(
    () =>
      form.roleSelection.startsWith("preset:")
        ? ROLE_OPTIONS.find((role) => role.value === form.roleSelection.replace("preset:", ""))
        : null,
    [form.roleSelection],
  );

  const selectedCustomRole = useMemo(
    () =>
      form.roleSelection.startsWith("custom:")
        ? customRoles.find((role) => role.id === form.roleSelection.replace("custom:", ""))
        : null,
    [customRoles, form.roleSelection],
  );

  const canSubmit =
    form.email.trim().includes("@") &&
    form.password.trim().length >= 6 &&
    Boolean(selectedPresetRole || selectedCustomRole) &&
    !saving;

  const submit = async () => {
    if (!token || !canSubmit) return;

    setSaving(true);
    try {
      await api.createUser(token, {
        name: form.name.trim() || undefined,
        email: form.email.trim(),
        password: form.password,
        role: selectedPresetRole?.value as PresetUserRole | undefined,
        customRoleId: selectedCustomRole?.id,
      });

      toast({
        title: "Usuario criado",
        description: "Novo acesso registrado com sucesso.",
        variant: "success",
      });
      setForm(initialForm);
    } catch (error) {
      toast({
        title: "Falha ao criar usuario",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  if (!canManageUsers) {
    return (
      <AccessDenied
        description="Seu cargo nao possui permissao para criar ou alterar acessos de usuarios."
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Card className="glass-panel border-border/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <UserPlus className="h-5 w-5 text-primary" />
            Criar usuario
          </CardTitle>
          <CardDescription>
            Cadastre um novo membro para acessar o painel com um cargo padrao ou personalizado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <label htmlFor="new-user-name" className="text-sm text-muted-foreground">
                Nome
              </label>
              <Input
                id="new-user-name"
                placeholder="Ex.: Joao Silva"
                value={form.name}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, name: event.target.value }))
                }
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <label htmlFor="new-user-email" className="text-sm text-muted-foreground">
                Email
              </label>
              <Input
                id="new-user-email"
                type="email"
                placeholder="usuario@empresa.com"
                value={form.email}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, email: event.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="new-user-password" className="text-sm text-muted-foreground">
                Senha
              </label>
              <Input
                id="new-user-password"
                type="password"
                placeholder="Minimo 6 caracteres"
                value={form.password}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, password: event.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="new-user-role" className="text-sm text-muted-foreground">
                Cargo
              </label>
              <div className="relative">
                <ShieldPlus className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <select
                  id="new-user-role"
                  className="h-10 w-full rounded-md border border-input bg-background pl-10 pr-3 text-sm outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring"
                  value={form.roleSelection}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      roleSelection: event.target.value,
                    }))
                  }
                >
                  <optgroup label="Cargos padrao">
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role.value} value={`preset:${role.value}`}>
                        {role.label}
                      </option>
                    ))}
                  </optgroup>
                  {customRoles.length > 0 && (
                    <optgroup label="Cargos personalizados">
                      {customRoles.map((role) => (
                        <option key={role.id} value={`custom:${role.id}`}>
                          {role.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
              <p className="text-xs text-muted-foreground">
                {selectedCustomRole?.description ??
                  selectedPresetRole?.description ??
                  (loadingRoles
                    ? "Carregando cargos personalizados..."
                    : "Selecione um cargo para esse usuario.")}
              </p>
              {!loadingRoles && customRoles.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Nenhum cargo personalizado criado ainda. Crie em Configuracoes.
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="button" onClick={submit} disabled={!canSubmit}>
              {saving ? "Salvando..." : "Criar usuario"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
