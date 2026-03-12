import { useState } from "react";
import { ShieldPlus, UserPlus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface FormState {
  name: string;
  email: string;
  password: string;
  role: "ADMIN" | "AGENT";
}

const initialForm: FormState = {
  name: "",
  email: "",
  password: "",
  role: "AGENT",
};

export default function CreateUserPage() {
  const { token, user } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(initialForm);
  const [saving, setSaving] = useState(false);

  const canSubmit =
    form.email.trim().includes("@") &&
    form.password.trim().length >= 6 &&
    !saving;

  const submit = async () => {
    if (!token || !canSubmit) return;

    setSaving(true);
    try {
      await api.createUser(token, {
        name: form.name.trim() || undefined,
        email: form.email.trim(),
        password: form.password,
        role: form.role,
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

  if (user?.role !== "ADMIN") {
    return (
      <Card className="glass-panel border-border/40">
        <CardHeader>
          <CardTitle>Acesso restrito</CardTitle>
          <CardDescription>
            Apenas administradores podem criar novos usuarios.
          </CardDescription>
        </CardHeader>
      </Card>
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
            Cadastre um novo membro para acessar o painel.
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
                Perfil
              </label>
              <div className="relative">
                <ShieldPlus className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <select
                  id="new-user-role"
                  className="h-10 w-full rounded-md border border-input bg-background pl-10 pr-3 text-sm outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring"
                  value={form.role}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      role: event.target.value === "ADMIN" ? "ADMIN" : "AGENT",
                    }))
                  }
                >
                  <option value="AGENT">AGENT</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </div>
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
