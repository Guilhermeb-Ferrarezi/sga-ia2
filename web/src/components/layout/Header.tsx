import { AlertTriangle, Clock3, LogOut, Menu, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useOperationalAlerts } from "@/contexts/OperationalAlertsContext";
import { useWebSocket, type WsConnectionStatus } from "@/contexts/WebSocketContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const statusColor: Record<WsConnectionStatus, string> = {
  connected: "bg-green-500",
  reconnecting: "bg-yellow-500 animate-pulse",
  disconnected: "bg-red-500",
};

const statusLabel: Record<WsConnectionStatus, string> = {
  connected: "Conectado",
  reconnecting: "Reconectando...",
  disconnected: "Desconectado",
};

interface HeaderProps {
  mobileMenuOpen: boolean;
  onToggleMobileMenu: () => void;
}

export default function Header({
  mobileMenuOpen,
  onToggleMobileMenu,
}: HeaderProps) {
  const { user, logout } = useAuth();
  const { status } = useWebSocket();
  const { summary } = useOperationalAlerts();
  const navigate = useNavigate();

  if (!user) return null;

  return (
    <header className="glass-panel sticky top-0 z-40 border-b border-border/40 animate-fade-up">
      <div className="container flex h-16 items-center justify-between gap-4 px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="shrink-0 lg:hidden"
            onClick={onToggleMobileMenu}
            aria-label={mobileMenuOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-sidebar"
          >
            {mobileMenuOpen ? (
              <X className="h-4 w-4" />
            ) : (
              <Menu className="h-4 w-4" />
            )}
          </Button>
          <div className="min-w-0 space-y-0.5 lg:hidden">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              SGA
            </p>
            <h1 className="truncate text-base font-bold leading-tight sm:text-lg">
              Central de Conversas
            </h1>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {/* WS connection indicator */}
          <div className="flex items-center gap-1.5" title={statusLabel[status]}>
            <span className={cn("h-2.5 w-2.5 rounded-full", statusColor[status])} />
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {statusLabel[status]}
            </span>
          </div>

          {summary.pendingHandoffs > 0 && (
            <div
              className={cn(
                "hidden items-center gap-1 rounded-md border px-2 py-1 text-xs sm:flex",
                summary.criticalHandoffs > 0
                  ? "border-rose-500/40 bg-rose-500/10 text-rose-100"
                  : "border-amber-500/40 bg-amber-500/10 text-amber-100",
              )}
              title="Fila de atendimento humano"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              {summary.pendingHandoffs} handoff
            </div>
          )}
          {summary.overdueTasks > 0 && (
            <div
              className="hidden items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-100 sm:flex"
              title="Tarefas vencidas"
            >
              <Clock3 className="h-3.5 w-3.5" />
              {summary.overdueTasks} vencidas
            </div>
          )}

          <button
            type="button"
            className="flex shrink-0 items-center gap-2 cursor-pointer rounded-lg px-1 py-1 transition hover:bg-muted/60"
            onClick={() => navigate("/dashboard/profile")}
            title="Meu Perfil"
          >
            <Avatar className="h-9 w-9 border border-border">
              {user.avatarUrl ? (
                <AvatarImage src={user.avatarUrl} alt="Avatar" />
              ) : null}
              <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                {(user.name ?? user.email).slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="hidden text-right lg:block">
              <p className="text-sm font-medium">{user.name ?? user.email}</p>
              <p className="text-xs text-muted-foreground">{user.role}</p>
            </div>
          </button>  
        </div>
      </div>
    </header>
  );
}
