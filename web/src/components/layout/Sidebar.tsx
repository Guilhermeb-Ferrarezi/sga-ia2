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
} from "lucide-react";
import { useOperationalAlerts } from "@/contexts/OperationalAlertsContext";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const links = [
  { to: "/dashboard", label: "Visao Geral", icon: BarChart3, end: true },
  { to: "/dashboard/conversations", label: "Conversas", icon: MessageSquareText },
  { to: "/dashboard/pipeline", label: "Pipeline", icon: Columns3 },
  { to: "/dashboard/handoffs", label: "Handoff", icon: Users },
  { to: "/dashboard/tasks", label: "Tarefas", icon: ListTodo },
  { to: "/dashboard/faqs", label: "FAQs", icon: HelpCircle },
  { to: "/dashboard/templates", label: "Templates", icon: FileText },
  { to: "/dashboard/tags", label: "Tags", icon: Tags },
];

export default function Sidebar() {
  const { summary } = useOperationalAlerts();

  return (
    <aside className="hidden w-56 shrink-0 border-r border-border/40 lg:block animate-fade-up">
      <nav className="flex flex-col gap-1 p-3">
        {links.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
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
        ))}
      </nav>
    </aside>
  );
}
