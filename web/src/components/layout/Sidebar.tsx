import { useEffect } from "react";
import { NavLink } from "react-router-dom";
import {
  BarChart3,
  MessageSquareText,
  Columns3,
  HelpCircle,
  FileText,
  Tags,
  ListTodo,
  Users,
  UserPlus,
  UserCog,
  Volume2,
  Smartphone,
  LogOut,
  X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useOperationalAlerts } from "@/contexts/OperationalAlertsContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const links = [
  { to: "/dashboard", label: "Visao Geral", icon: BarChart3, end: true },
  { to: "/dashboard/conversations", label: "Conversas", icon: MessageSquareText },
  { to: "/dashboard/contacts", label: "Contatos", icon: Users },
  { to: "/dashboard/users/new", label: "Criar usuario", icon: UserPlus },
  { to: "/dashboard/pipeline", label: "Pipeline", icon: Columns3 },
  { to: "/dashboard/handoffs", label: "Handoff", icon: Users },
  { to: "/dashboard/tasks", label: "Tarefas", icon: ListTodo },
  { to: "/dashboard/faqs", label: "FAQs", icon: HelpCircle },
  { to: "/dashboard/templates", label: "Templates", icon: FileText },
  { to: "/dashboard/tags", label: "Tags", icon: Tags },
  { to: "/dashboard/audios", label: "Audios", icon: Volume2 },
  { to: "/dashboard/whatsapp-profile", label: "Perfil WhatsApp", icon: Smartphone },
  { to: "/dashboard/profile", label: "Meu Perfil", icon: UserCog },
];

interface SidebarProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export default function Sidebar({ mobileOpen, onCloseMobile }: SidebarProps) {
  const { logout } = useAuth();
  const { summary } = useOperationalAlerts();

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseMobile();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileOpen, onCloseMobile]);

  const renderLinks = (onNavigate?: () => void) =>
    links.map(({ to, label, icon: Icon, end }) => (
      <NavLink
        key={to}
        to={to}
        end={end}
        onClick={onNavigate}
        className={({ isActive }) =>
          cn(
            "interactive-lift flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition",
            isActive
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
          )
        }
      >
        <Icon className="h-4 w-4" />
        <span>{label}</span>
        {to === "/dashboard/handoffs" && summary.pendingHandoffs > 0 && (
          <Badge
            variant="outline"
            className={cn(
              "ml-auto h-5 px-1.5 text-[10px]",
              summary.criticalHandoffs > 0
                ? "border-rose-500/50 bg-rose-500/10 text-rose-200"
                : "border-amber-500/50 bg-amber-500/10 text-amber-200",
            )}
          >
            {summary.pendingHandoffs}
          </Badge>
        )}
        {to === "/dashboard/tasks" && summary.overdueTasks > 0 && (
          <Badge
            variant="outline"
            className="ml-auto h-5 px-1.5 text-[10px] border-amber-500/50 bg-amber-500/10 text-amber-200"
          >
            {summary.overdueTasks}
          </Badge>
        )}
      </NavLink>
    ));

  return (
    <>
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 lg:flex animate-fade-up z-30">
        <div className="flex h-16 shrink-0 items-center px-5 border-b border-border/40">
          <div className="min-w-0 space-y-0.5">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              SGA
            </p>
            <h1 className="truncate text-base font-bold leading-tight">
              Painel
            </h1>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          {renderLinks()}
        </nav>
        <div className="border-t border-border/40 p-3">
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start"
            onClick={logout}
          >
            <LogOut className="h-4 w-4" />
            <span className="ml-2">Sair</span>
          </Button>
        </div>
      </aside>

      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/55 backdrop-blur-[1px] transition-opacity duration-300 lg:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        aria-hidden="true"
        onClick={onCloseMobile}
      />

      <aside
        id="mobile-sidebar"
        role="dialog"
        aria-modal="true"
        aria-label="Menu de navegacao"
        className={cn(
          "glass-panel fixed inset-y-0 left-0 z-50 w-[84vw] max-w-72 border-r border-border/60 transition-transform duration-300 lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-border/50 px-3">
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
            Navegacao
          </p>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onCloseMobile}
            aria-label="Fechar menu"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
            {renderLinks(onCloseMobile)}
          </nav>
          <div className="border-t border-border/40 p-3">
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start"
              onClick={() => {
                onCloseMobile();
                logout();
              }}
            >
              <LogOut className="h-4 w-4" />
              <span className="ml-2">Sair</span>
            </Button>
          </div>
        </div>
      </aside>
    </>
  );
}
