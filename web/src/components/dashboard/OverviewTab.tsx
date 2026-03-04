import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  MessageSquareText,
  RefreshCcw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useWebSocket, type WsEventPayload } from "@/contexts/WebSocketContext";
import { api, type DashboardOverview } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import MetricCard from "@/components/dashboard/MetricCard";

const metricCards: Array<{
  key: keyof DashboardOverview;
  title: string;
  icon: typeof MessageSquareText;
}> = [
  { key: "totalMessages", title: "Mensagens Totais", icon: MessageSquareText },
  { key: "userMessages", title: "Msgs de Clientes", icon: Users },
  { key: "assistantMessages", title: "Msgs da IA", icon: Activity },
  { key: "totalContacts", title: "Contatos Ativos", icon: ShieldCheck },
];

export default function OverviewTab() {
  const { token, logout } = useAuth();
  const { subscribe } = useWebSocket();
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.overview(token);
      setOverview(data);
    } catch (err: unknown) {
      if (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 401) {
        logout();
        return;
      }
      setError(err instanceof Error ? err.message : "Falha ao carregar");
    } finally {
      setLoading(false);
    }
  }, [token, logout]);

  useEffect(() => {
    void load();
  }, [load]);

  // Listen for real-time overview updates
  useEffect(() => {
    return subscribe((event: WsEventPayload) => {
      if (event.type === "overview:updated") {
        setOverview(event.payload as unknown as DashboardOverview);
      }
    });
  }, [subscribe]);

  return (
    <div className="stagger space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Visao Geral</h2>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCcw className={cn("h-4 w-4", loading && "animate-spin")} />
          Atualizar
        </Button>
      </div>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metricCards.map(({ key, title, icon: Icon }, index) => (
          <MetricCard
            key={key}
            title={title}
            value={overview ? overview[key] : "--"}
            icon={<Icon className="h-5 w-5 text-primary" />}
            delay={index * 80}
          />
        ))}
      </div>

      <Card className="animate-fade-up" style={{ animationDelay: "220ms" }}>
        <CardHeader>
          <CardTitle>Operacao</CardTitle>
          <CardDescription>
            O painel usa autenticacao JWT, WebSocket para real-time e dados persistidos no PostgreSQL.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Backend ativo em API_BASE_PATH={import.meta.env.VITE_API_BASE ?? "/api"}.
            Se nao aparecer conversa, valide ENABLE_DB=true e rode as migracoes.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
