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
import { motion, AnimatePresence } from "framer-motion";
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
    transition: { delay: i * 0.08, type: "spring", stiffness: 300, damping: 24 },
  }),
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

  const maxTrend = leads?.dailyTrend.length
    ? Math.max(...leads.dailyTrend.map((d) => d.count), 1)
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
      {leads && leads.dailyTrend.length > 0 && (
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
            <CardContent>
              <div className="flex items-end gap-1 h-40">
                {leads.dailyTrend.map((d, i) => (
                  <motion.div
                    key={d.day}
                    className="group relative flex-1 flex flex-col items-center justify-end"
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ delay: 0.5 + i * 0.02, type: "spring", stiffness: 200 }}
                    style={{ originY: 1 }}
                  >
                    <motion.div
                      className="w-full rounded-t bg-primary/70 hover:bg-primary transition-colors cursor-default relative"
                      style={{ height: `${Math.max(4, (d.count / maxTrend) * 100)}%` }}
                      whileHover={{ scaleX: 1.3 }}
                    >
                      <div className="absolute -top-7 left-1/2 -translate-x-1/2 hidden group-hover:block bg-popover text-popover-foreground text-[10px] px-1.5 py-0.5 rounded shadow-lg whitespace-nowrap border border-border">
                        {d.day.slice(5)}: {d.count}
                      </div>
                    </motion.div>
                  </motion.div>
                ))}
              </div>
              <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
                <span>{leads.dailyTrend[0]?.day.slice(5)}</span>
                <span>{leads.dailyTrend[leads.dailyTrend.length - 1]?.day.slice(5)}</span>
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
