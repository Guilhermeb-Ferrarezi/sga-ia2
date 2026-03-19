import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ShieldAlert, Trash2, UserPlus, Users } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { api, type ManagedUser } from "@/lib/api";
import { PERMISSIONS, hasPermission } from "@/lib/rbac";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import AccessDenied from "@/components/auth/AccessDenied";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const formatDateTime = (value: string): string =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

export default function UsersPage() {
  const { token, user } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const canManageUsers = hasPermission(user, PERMISSIONS.USERS_MANAGE);

  useEffect(() => {
    if (!token || !canManageUsers) return;

    let cancelled = false;
    const loadUsers = async () => {
      setLoading(true);
      try {
        const items = await api.users(token);
        if (!cancelled) setUsers(items);
      } catch (error) {
        if (!cancelled) {
          toast({
            title: "Falha ao carregar usuarios",
            description: error instanceof Error ? error.message : "Tente novamente.",
            variant: "error",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadUsers();
    return () => {
      cancelled = true;
    };
  }, [token, canManageUsers, toast]);

  const summary = useMemo(
    () => ({
      total: users.length,
      admins: users.filter((item) => item.role === "ADMIN").length,
      custom: users.filter((item) => item.role === "CUSTOM").length,
    }),
    [users],
  );

  if (!canManageUsers) {
    return (
      <AccessDenied description="Seu cargo nao possui permissao para visualizar usuarios do painel." />
    );
  }

  const handleDelete = async (managedUser: ManagedUser) => {
    if (!token) return;
    if (!window.confirm(`Excluir o usuario "${managedUser.name ?? managedUser.email}"?`)) {
      return;
    }

    setDeletingId(managedUser.id);
    try {
      await api.deleteUser(token, managedUser.id);
      setUsers((current) => current.filter((item) => item.id !== managedUser.id));
      toast({
        title: "Usuario removido",
        description: "O acesso foi excluido com sucesso.",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Falha ao excluir usuario",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "error",
      });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <motion.div className="space-y-5" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: "easeOut" }}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-bold">Usuarios</h2>
          <p className="text-sm text-muted-foreground">
            Visualize os acessos do painel. Contas admin ficam protegidas contra exclusao e alteracao.
          </p>
        </div>
        <Button asChild>
          <Link to="/dashboard/users/new">
            <UserPlus className="h-4 w-4" />
            Criar usuario
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total de acessos</CardDescription>
            <CardTitle>{summary.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Administradores protegidos</CardDescription>
            <CardTitle>{summary.admins}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Cargos personalizados</CardDescription>
            <CardTitle>{summary.custom}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Lista de usuarios
          </CardTitle>
          <CardDescription>
            O backend bloqueia exclusao de `ADMIN` e tambem impede remover o proprio usuario.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando usuarios...</p>
          ) : users.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum usuario encontrado.</p>
          ) : (
            users.map((managedUser) => {
              const isAdmin = managedUser.role === "ADMIN";
              const isSelf = managedUser.id === user?.id;
              const isProtected = isAdmin || isSelf;
              const initials = (managedUser.name ?? managedUser.email).slice(0, 2).toUpperCase();

              return (
                <div
                  key={managedUser.id}
                  className="rounded-xl border border-border/60 bg-background/40 p-4"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex items-start gap-3">
                      <Avatar className="h-11 w-11 border border-border">
                        {managedUser.avatarUrl ? (
                          <AvatarImage src={managedUser.avatarUrl} alt={managedUser.email} />
                        ) : null}
                        <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                          {initials}
                        </AvatarFallback>
                      </Avatar>

                      <div className="space-y-2">
                        <div className="space-y-0.5">
                          <h3 className="font-semibold">{managedUser.name ?? "Sem nome"}</h3>
                          <p className="text-sm text-muted-foreground">{managedUser.email}</p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline">{managedUser.roleLabel}</Badge>
                          {managedUser.customRole && (
                            <Badge variant="secondary">{managedUser.customRole.name}</Badge>
                          )}
                          {isAdmin && (
                            <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-200">
                              Admin protegido
                            </Badge>
                          )}
                          {isSelf && <Badge variant="outline">Voce</Badge>}
                        </div>

                        <p className="text-xs text-muted-foreground">
                          Criado em {formatDateTime(managedUser.createdAt)}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col items-start gap-2 lg:items-end">
                      {isAdmin ? (
                        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                          <ShieldAlert className="h-4 w-4" />
                          Conta admin nao pode ser alterada nem excluida.
                        </div>
                      ) : isSelf ? (
                        <div className="rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
                          Use Configuracoes para editar seu proprio acesso.
                        </div>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={deletingId === managedUser.id || isProtected}
                          onClick={() => void handleDelete(managedUser)}
                        >
                          <Trash2 className="h-4 w-4" />
                          {deletingId === managedUser.id ? "Excluindo..." : "Excluir"}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
