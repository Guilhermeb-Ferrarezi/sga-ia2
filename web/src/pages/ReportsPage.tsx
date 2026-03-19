import { useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  Download,
  TrendingUp,
  Users,
  MessageSquare,
  Clock,
  Target,
  Award,
} from "lucide-react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { api, type LeadsReport, type PerformanceReport } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function AnimatedCounter({ value, suffix = "" }: { value: number; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (value === 0) { setDisplay(0); return; }
    const duration = 800;
    const steps = 30;
    const interval = duration / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += value / steps;
      if (current >= value) {
        setDisplay(value);
        clearInterval(timer);
      } else {
        setDisplay(Math.round(current));
      }
    }, interval);
    return () => clearInterval(timer);
  }, [value]);
  return (
    <span>
      {display}
      {suffix}
    </span>
  );
}

const cardVariant = {
  hidden: { opacity: 0, y: 24, scale: 0.96 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      delay: i * 0.08,
      type: "spring" as const,
      stiffness: 300,
      damping: 24,
    },
  }),
} satisfies Variants;

const parseTrendDate = (value: string): Date | null => {
  if (!value) return null;

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const fallback = new Date(value);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
};

const formatTrendLabel = (value: string): string => {
  const parsed = parseTrendDate(value);
  if (!parsed) return value;

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(parsed);
};

export default function ReportsPage() {
  const { token } = useAuth();
  const [leads, setLeads] = useState<LeadsReport | null>(null);
  const [perf, setPerf] = useState<PerformanceReport | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [l, p] = await Promise.all([
        api.reportsLeads(token, days),
        api.reportsPerformance(token, days),
      ]);
      setLeads(l);
      setPerf(p);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [token, days]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportCsv = async () => {
    if (!token) return;
    setExporting(true);
    try {
      const blob = await api.reportsExportCsv(token);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "contacts-export.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    } finally {
      setExporting(false);
    }
  };

  const safeDailyTrend = Array.isArray(leads?.dailyTrend)
    ? leads.dailyTrend.filter(
        (point): point is LeadsReport["dailyTrend"][number] =>
          typeof point?.day === "string" && Number.isFinite(point?.count),
      )
    : [];
  const maxTrend = safeDailyTrend.length
    ? Math.max(...safeDailyTrend.map((d) => d.count), 1)
    : 1;

  const kpis = leads
    ? [
        {
          label: "Total Leads",
          value: leads.totalLeads,
          icon: Users,
          color: "text-blue-400",
          bg: "bg-blue-500/10",
        },
        {
          label: "Qualificados",
          value: leads.qualifiedLeads,
          icon: Target,
          color: "text-green-400",
          bg: "bg-green-500/10",
          suffix: ` (${leads.qualificationRate}%)`,
        },
        {
          label: "Convertidos",
          value: leads.wonLeads,
          icon: Award,
          color: "text-emerald-400",
          bg: "bg-emerald-500/10",
          suffix: ` (${leads.conversionRate}%)`,
        },
        {
          label: "Perdidos",
          value: leads.lostLeads,
          icon: TrendingUp,
          color: "text-red-400",
          bg: "bg-red-500/10",
        },
        {
          label: "Mensagens",
          value: leads.totalMessages,
          icon: MessageSquare,
          color: "text-purple-400",
          bg: "bg-purple-500/10",
        },
        {
          label: "Tempo Medio",
          value: leads.avgResponseMinutes ?? 0,
          icon: Clock,
          color: "text-amber-400",
          bg: "bg-amber-500/10",
          suffix: " min",
        },
      ]
    : [];

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* Header */}
      <motion.div
        className="flex items-center justify-between"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div className="flex items-center gap-3">
          <motion.div
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10"
            whileHover={{ scale: 1.1, rotate: -5 }}
          >
            <BarChart3 className="h-5 w-5 text-primary" />
          </motion.div>
          <div>
            <h2 className="text-xl font-bold">Relatorios</h2>
            <p className="text-xs text-muted-foreground">
              Metricas e desempenho do atendimento
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value={7}>7 dias</option>
            <option value={14}>14 dias</option>
            <option value={30}>30 dias</option>
            <option value={60}>60 dias</option>
            <option value={90}>90 dias</option>
          </select>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void exportCsv()}
              disabled={exporting}
            >
              <Download className="h-4 w-4 mr-1" />
              {exporting ? "Exportando..." : "Exportar CSV"}
            </Button>
          </motion.div>
        </div>
      </motion.div>

      {/* KPI Cards */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <motion.div
              key={i}
              className="rounded-xl border border-border/60 bg-card/50 p-5 space-y-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.1 }}
            >
              <div className="h-4 w-1/3 rounded bg-muted/60" />
              <div className="h-8 w-1/2 rounded bg-muted/60" />
            </motion.div>
          ))}
        </div>
      ) : (
        <motion.div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          initial="hidden"
          animate="show"
        >
          {kpis.map((kpi, i) => (
            <motion.div key={kpi.label} custom={i} variants={cardVariant}>
              <Card className="overflow-hidden group hover:border-primary/25 transition-colors duration-200">
                <CardContent className="flex items-center gap-4 p-5">
                  <motion.div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${kpi.bg}`}
                    whileHover={{ scale: 1.15, rotate: 8 }}
                    transition={{ type: "spring", stiffness: 400 }}
                  >
                    <kpi.icon className={`h-6 w-6 ${kpi.color}`} />
                  </motion.div>
                  <div>
                    <p className="text-sm text-muted-foreground">{kpi.label}</p>
                    <p className="text-2xl font-bold">
                      <AnimatedCounter value={kpi.value} />
                      {kpi.suffix && (
                        <span className="text-sm font-normal text-muted-foreground ml-1">
                          {kpi.suffix}
                        </span>
                      )}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Daily Trend */}
      {leads && safeDailyTrend.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Leads por Dia</CardTitle>
              <CardDescription>Novos contatos nos ultimos {days} dias</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-xl border border-border/60 bg-background/40 p-3">
                <div className="relative">
                  <div className="pointer-events-none absolute inset-0 grid grid-rows-4">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <div
                        key={index}
                        className="border-t border-dashed border-border/50 first:border-t-0"
                      />
                    ))}
                  </div>
                  <div className="overflow-x-auto pb-2">
                    <div className="flex h-56 min-w-max items-end gap-2 px-1 pt-3">
                      {safeDailyTrend.map((d, i) => {
                        const barHeight =
                          d.count <= 0 ? 8 : Math.max(18, (d.count / maxTrend) * 180);
                        return (
                          <motion.div
                            key={d.day}
                            className="group flex w-10 shrink-0 flex-col items-center gap-2"
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.45 + i * 0.02, type: "spring", stiffness: 200 }}
                          >
                            <span className="text-[10px] font-medium text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                              {d.count}
                            </span>
                            <motion.div
                              className="relative flex w-full items-end justify-center overflow-hidden rounded-t-xl border border-primary/20 bg-primary/15"
                              style={{ height: `${barHeight}px` }}
                              whileHover={{ y: -4 }}
                            >
                              <div className="absolute inset-x-0 bottom-0 rounded-t-xl bg-gradient-to-t from-primary via-primary/90 to-cyan-300/90" style={{ height: `${barHeight}px` }} />
                              <div className="absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100">
                                <div className="absolute -top-8 left-1/2 -translate-x-1/2 rounded-md border border-border bg-popover px-2 py-1 text-[10px] text-popover-foreground shadow-lg whitespace-nowrap">
                                  {formatTrendLabel(d.day)}: {d.count}
                                </div>
                              </div>
                            </motion.div>
                            <span className="text-[10px] text-muted-foreground">
                              {formatTrendLabel(d.day)}
                            </span>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  Pico: {maxTrend} lead(s) em um dia
                </span>
                <span>
                  {safeDailyTrend.length} ponto(s) no periodo
                </span>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Agent Performance */}
      {perf && perf.agents.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Desempenho por Agente</CardTitle>
              <CardDescription>Mensagens enviadas e handoffs resolvidos</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <AnimatePresence>
                  {perf.agents.map((agent, i) => (
                    <motion.div
                      key={agent.agentId}
                      className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-muted/20 hover:border-primary/20 transition-colors"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.6 + i * 0.06 }}
                    >
                      <div className="flex items-center gap-3">
                        <motion.div
                          className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary"
                          whileHover={{ scale: 1.15 }}
                        >
                          {(agent.name ?? "?").charAt(0).toUpperCase()}
                        </motion.div>
                        <div>
                          <p className="text-sm font-medium">{agent.name}</p>
                          <p className="text-xs text-muted-foreground">{agent.email}</p>
                        </div>
                      </div>
                      <div className="flex gap-6 text-sm">
                        <div className="text-center">
                          <p className="font-bold text-blue-400">
                            <AnimatedCounter value={agent.messagesSent} />
                          </p>
                          <p className="text-[10px] text-muted-foreground">msgs</p>
                        </div>
                        <div className="text-center">
                          <p className="font-bold text-green-400">
                            <AnimatedCounter value={agent.handoffsResolved} />
                          </p>
                          <p className="text-[10px] text-muted-foreground">resolvidos</p>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </motion.div>
  );
}
