import { AlertTriangle, Clock3, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useOperationalAlerts } from "@/contexts/OperationalAlertsContext";
import { useWebSocket, type WsConnectionStatus } from "@/contexts/WebSocketContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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

export default function Header() {
  const { user, logout } = useAuth();
  const { status } = useWebSocket();
  const { summary } = useOperationalAlerts();

  if (!user) return null;

  return (
    <header className="glass-panel sticky top-0 z-40 border-b border-border/40 animate-fade-up">
      <div className="container flex h-16 items-center justify-between gap-4 px-5">
        <div className="space-y-0.5">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            SG Esports IA
          </p>
          <h1 className="text-lg font-bold leading-tight">Central de Conversas</h1>
        </div>

        <div className="flex items-center gap-3">
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

          <Avatar className="h-9 w-9 border border-border">
            <AvatarFallback className="bg-primary text-primary-foreground text-xs">
              {user.email.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium">{user.email}</p>
            <p className="text-xs text-muted-foreground">{user.role}</p>
          </div>
          <Button variant="outline" size="sm" className="ml-1" onClick={logout}>
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline ml-1">Sair</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
