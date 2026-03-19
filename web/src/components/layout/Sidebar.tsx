import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  BarChart3,
  ChevronDown,
  Columns3,
  FileText,
  HelpCircle,
  LogOut,
  MessageSquareText,
  PieChart,
  Settings2,
  Smartphone,
  Tags,
  Users,
  UserPlus,
  Volume2,
  X,
  ListTodo,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useOperationalAlerts } from "@/contexts/OperationalAlertsContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AuthUser } from "@/lib/api";
import { PERMISSIONS, hasPermission, type Permission } from "@/lib/rbac";
import { cn } from "@/lib/utils";

type NavLinkItem = {
  type: "link";
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  permission?: Permission;
};

type NavGroupItem = {
  type: "group";
  id: string;
  label: string;
  icon: LucideIcon;
  children: NavLinkItem[];
};

type NavItem = NavLinkItem | NavGroupItem;

const navItems: NavItem[] = [
  {
    type: "group",
    id: "analytics",
    label: "Painel",
    icon: BarChart3,
    children: [
      {
        type: "link",
        to: "/dashboard",
        label: "Visao Geral",
        icon: BarChart3,
        end: true,
        permission: PERMISSIONS.DASHBOARD_VIEW,
      },
      {
        type: "link",
        to: "/dashboard/reports",
        label: "Relatorios",
        icon: PieChart,
        permission: PERMISSIONS.DASHBOARD_VIEW,
      },
    ],
  },
  {
    type: "group",
    id: "attendance",
    label: "Atendimento",
    icon: MessageSquareText,
    children: [
      {
        type: "link",
        to: "/dashboard/conversations",
        label: "Conversas",
        icon: MessageSquareText,
        permission: PERMISSIONS.CONVERSATIONS_VIEW,
      },
      {
        type: "link",
        to: "/dashboard/contacts",
        label: "Contatos",
        icon: Users,
        permission: PERMISSIONS.CONTACTS_VIEW,
      },
      {
        type: "link",
        to: "/dashboard/pipeline",
        label: "Pipeline",
        icon: Columns3,
        permission: PERMISSIONS.PIPELINE_VIEW,
      },
      {
        type: "link",
        to: "/dashboard/handoffs",
        label: "Handoff",
        icon: Users,
        permission: PERMISSIONS.HANDOFF_VIEW,
      },
      {
        type: "link",
        to: "/dashboard/tasks",
        label: "Tarefas",
        icon: ListTodo,
        permission: PERMISSIONS.TASKS_VIEW,
      },
    ],
  },
  {
    type: "group",
    id: "users",
    label: "Usuarios",
    icon: Users,
    children: [
      {
        type: "link",
        to: "/dashboard/users",
        label: "Lista de usuarios",
        icon: Users,
        end: true,
        permission: PERMISSIONS.USERS_MANAGE,
      },
      {
        type: "link",
        to: "/dashboard/users/new",
        label: "Criar usuario",
        icon: UserPlus,
        permission: PERMISSIONS.USERS_MANAGE,
      },
    ],
  },
  {
    type: "group",
    id: "content",
    label: "Conteudo",
    icon: FileText,
    children: [
      {
        type: "link",
        to: "/dashboard/faqs",
        label: "FAQs",
        icon: HelpCircle,
        permission: PERMISSIONS.FAQS_VIEW,
      },
      {
        type: "link",
        to: "/dashboard/templates",
        label: "Templates",
        icon: FileText,
        permission: PERMISSIONS.TEMPLATES_VIEW,
      },
      {
        type: "link",
        to: "/dashboard/tags",
        label: "Tags",
        icon: Tags,
        permission: PERMISSIONS.TAGS_VIEW,
      },
      {
        type: "link",
        to: "/dashboard/audios",
        label: "Audios",
        icon: Volume2,
        permission: PERMISSIONS.AUDIOS_VIEW,
      },
      {
        type: "link",
        to: "/dashboard/whatsapp-profile",
        label: "Perfil WhatsApp",
        icon: Smartphone,
        permission: PERMISSIONS.WHATSAPP_PROFILE_VIEW,
      },
    ],
  },
  {
    type: "link",
    to: "/dashboard/settings",
    label: "Configuracoes",
    icon: Settings2,
  },
];

const isLinkVisible = (item: NavLinkItem, user: AuthUser | null): boolean =>
  !item.permission || hasPermission(user, item.permission);

const isLinkActive = (item: NavLinkItem, pathname: string): boolean =>
  item.end
    ? pathname === item.to
    : pathname === item.to || pathname.startsWith(`${item.to}/`);

const buildOpenGroups = (
  pathname: string,
  user: AuthUser | null,
): Record<string, boolean> => {
  const open: Record<string, boolean> = {};

  for (const item of navItems) {
    if (item.type !== "group") continue;

    const visibleChildren = item.children.filter((child) => isLinkVisible(child, user));
    if (visibleChildren.length === 0) continue;

    open[item.id] = visibleChildren.some((child) => isLinkActive(child, pathname));
  }

  return open;
};

interface SidebarProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export default function Sidebar({ mobileOpen, onCloseMobile }: SidebarProps) {
  const { logout, user } = useAuth();
  const { summary } = useOperationalAlerts();
  const location = useLocation();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    buildOpenGroups(location.pathname, user),
  );

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

  useEffect(() => {
    setOpenGroups((current) => {
      const next = { ...current };
      let changed = false;

      for (const item of navItems) {
        if (item.type !== "group") continue;
        const visibleChildren = item.children.filter((child) => isLinkVisible(child, user));
        if (visibleChildren.length === 0) continue;

        const hasActiveChild = visibleChildren.some((child) =>
          isLinkActive(child, location.pathname)
        );
        if (hasActiveChild && !next[item.id]) {
          next[item.id] = true;
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [location.pathname, user]);

  const getLinkBadge = (to: string) => {
    if (to === "/dashboard/handoffs" && summary.pendingHandoffs > 0) {
      return (
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
      );
    }

    if (to === "/dashboard/tasks" && summary.overdueTasks > 0) {
      return (
        <Badge
          variant="outline"
          className="ml-auto h-5 px-1.5 text-[10px] border-amber-500/50 bg-amber-500/10 text-amber-200"
        >
          {summary.overdueTasks}
        </Badge>
      );
    }

    return null;
  };

  const renderLink = (item: NavLinkItem, onNavigate?: () => void, nested = false) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "interactive-lift flex items-center gap-2.5 rounded-lg text-sm font-medium transition",
          nested ? "px-3 py-2 text-[13px]" : "px-3 py-2.5",
          isActive
            ? "bg-primary/15 text-primary"
            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        )
      }
    >
      <item.icon className={cn("shrink-0", nested ? "h-3.5 w-3.5" : "h-4 w-4")} />
      <span className="truncate">{item.label}</span>
      {getLinkBadge(item.to)}
    </NavLink>
  );

  const renderNav = (onNavigate?: () => void) =>
    navItems
      .map((item) => {
        if (item.type === "link") {
          if (!isLinkVisible(item, user)) return null;
          return renderLink(item, onNavigate);
        }

        const visibleChildren = item.children.filter((child) => isLinkVisible(child, user));
        if (visibleChildren.length === 0) return null;

        const hasActiveChild = visibleChildren.some((child) =>
          isLinkActive(child, location.pathname)
        );
        const isOpen = openGroups[item.id] ?? false;

        return (
          <div key={item.id} className="space-y-1">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() =>
                setOpenGroups((current) => ({
                  ...current,
                  [item.id]: !(current[item.id] ?? false),
                }))
              }
              className={cn(
                "interactive-lift flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition",
                hasActiveChild || isOpen
                  ? "bg-primary/10 text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 transition-transform duration-200",
                  isOpen ? "rotate-180" : "rotate-0",
                )}
              />
            </button>

            {isOpen && (
              <div className="ml-3 space-y-1 border-l border-border/50 pl-3">
                {visibleChildren.map((child) => renderLink(child, onNavigate, true))}
              </div>
            )}
          </div>
        );
      })
      .filter(Boolean);

  return (
    <>
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 lg:flex animate-fade-up z-30">
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
        <nav className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
          {renderNav()}
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
          <nav className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
            {renderNav(onCloseMobile)}
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
