import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { useWebSocket } from "@/contexts/WebSocketContext";
import { api } from "@/services/api/client";
import type {
  DashboardConversation,
  DashboardOverview,
  OperationalAlertsSummary,
} from "@/types";

// ── Metric card ─────────────────────────────────────────────

function MetricCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color: string;
}) {
  return (
    <View style={[styles.metricCard, { borderLeftColor: color }]}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

// ── Alert badge ─────────────────────────────────────────────

function AlertBadge({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  if (count === 0) return null;
  return (
    <View style={[styles.alertBadge, { backgroundColor: color }]}>
      <Text style={styles.alertBadgeText}>
        {count} {label}
      </Text>
    </View>
  );
}

// ── Conversation row ────────────────────────────────────────

const formatDate = (value: string): string =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));

function ConversationRow({ item }: { item: DashboardConversation }) {
  return (
    <View style={styles.convRow}>
      <View style={styles.convHeader}>
        <Text style={styles.convName} numberOfLines={1}>
          {item.name ?? item.phone}
        </Text>
        <Text style={styles.convDate}>{formatDate(item.lastMessageAt)}</Text>
      </View>
      <Text style={styles.convPreview} numberOfLines={1}>
        {item.lastMessagePreview}
      </Text>
      <Text style={styles.convCount}>{item.messagesCount} msgs</Text>
    </View>
  );
}

// ── Main screen ─────────────────────────────────────────────

export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { logout } = useAuth();
  const { subscribe, status } = useWebSocket();
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [alerts, setAlerts] = useState<OperationalAlertsSummary | null>(null);
  const [conversations, setConversations] = useState<DashboardConversation[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 360,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [ov, al, conv] = await Promise.all([
        api.overview(),
        api.alertsSummary(),
        api.conversations(8),
      ]);
      setOverview(ov);
      setAlerts(al);
      setConversations(conv);
    } catch (err: unknown) {
      if (
        err &&
        typeof err === "object" &&
        "status" in err &&
        (err as { status: number }).status === 401
      ) {
        logout();
        return;
      }
      setError(err instanceof Error ? err.message : "Falha ao carregar");
    } finally {
      setLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    void load();
  }, [load]);

  // Auto-refresh on WS events
  useEffect(() => {
    return subscribe(() => {
      void load();
    });
  }, [subscribe, load]);

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={() => {
            setLoading(true);
            void load();
          }}
          tintColor="#6366f1"
          colors={["#6366f1"]}
        />
      }
    >
      <Animated.View style={{ opacity: fadeAnim }}>
        {/* Header */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Dashboard</Text>
            <View
              style={[
                styles.wsChip,
                status === "connected"
                  ? styles.wsChipOnline
                  : status === "reconnecting"
                    ? styles.wsChipWarn
                    : styles.wsChipOffline,
              ]}
            >
              <Text style={styles.wsChipText}>
                {status === "connected"
                  ? "WebSocket online"
                  : status === "reconnecting"
                    ? "WebSocket reconectando"
                    : "WebSocket offline"}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
            <Text style={styles.logoutText}>Sair</Text>
          </TouchableOpacity>
        </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

        {/* Metric cards */}
        {overview ? (
          <View style={styles.metricsGrid}>
            <MetricCard
              label="Mensagens Totais"
              value={overview.totalMessages}
              color="#6366f1"
            />
            <MetricCard
              label="Msgs de Clientes"
              value={overview.userMessages}
              color="#22d3ee"
            />
            <MetricCard
              label="Msgs da IA"
              value={overview.assistantMessages}
              color="#a78bfa"
            />
            <MetricCard
              label="Contatos Ativos"
              value={overview.totalContacts}
              color="#10b981"
            />
          </View>
        ) : null}

        {/* Operational alerts */}
        {alerts &&
        (alerts.overdueTasks > 0 ||
          alerts.pendingHandoffs > 0 ||
          alerts.criticalHandoffs > 0) ? (
          <View style={styles.alertsRow}>
            <AlertBadge
              label="tasks atrasadas"
              count={alerts.overdueTasks}
              color="rgba(239,68,68,0.25)"
            />
            <AlertBadge
              label="handoffs pendentes"
              count={alerts.pendingHandoffs}
              color="rgba(251,191,36,0.25)"
            />
            <AlertBadge
              label="handoffs críticos"
              count={alerts.criticalHandoffs}
              color="rgba(239,68,68,0.35)"
            />
          </View>
        ) : null}

        {/* Recent conversations */}
        <Text style={styles.sectionTitle}>Conversas Recentes</Text>
        {conversations.length === 0 ? (
          <Text style={styles.emptyText}>Nenhuma conversa ainda.</Text>
        ) : (
          conversations.map((c) => <ConversationRow key={c.phone} item={c} />)
        )}
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0f172a" },
  content: { padding: 16, paddingBottom: 40 },
  loader: {
    flex: 1,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  title: { color: "#f1f5f9", fontSize: 24, fontWeight: "700" },
  wsChip: {
    marginTop: 6,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  wsChipOnline: { backgroundColor: "rgba(16,185,129,0.2)" },
  wsChipWarn: { backgroundColor: "rgba(245,158,11,0.2)" },
  wsChipOffline: { backgroundColor: "rgba(239,68,68,0.2)" },
  wsChipText: { color: "#cbd5e1", fontSize: 11, fontWeight: "600" },
  logoutBtn: {
    backgroundColor: "#1e293b",
    borderWidth: 1,
    borderColor: "#334155",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  logoutText: { color: "#94a3b8", fontSize: 13, fontWeight: "600" },
  errorBox: {
    backgroundColor: "rgba(239,68,68,0.12)",
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  errorText: { color: "#fca5a5", fontSize: 13 },

  // Metrics
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  metricCard: {
    flex: 1,
    minWidth: "46%",
    backgroundColor: "#1e293b",
    borderRadius: 12,
    borderLeftWidth: 4,
    padding: 14,
  },
  metricValue: { color: "#f1f5f9", fontSize: 26, fontWeight: "700" },
  metricLabel: { color: "#94a3b8", fontSize: 12, marginTop: 4 },

  // Alerts
  alertsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  alertBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  alertBadgeText: { color: "#fbbf24", fontSize: 12, fontWeight: "600" },

  // Conversations
  sectionTitle: {
    color: "#cbd5e1",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 10,
    marginTop: 8,
  },
  emptyText: { color: "#64748b", fontSize: 13 },
  convRow: {
    backgroundColor: "#1e293b",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  convHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  convName: { color: "#f1f5f9", fontSize: 14, fontWeight: "600", flex: 1 },
  convDate: { color: "#64748b", fontSize: 11 },
  convPreview: { color: "#94a3b8", fontSize: 13, marginBottom: 4 },
  convCount: { color: "#475569", fontSize: 11 },
});
