import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/services/api/client";
import type { HandoffQueueItem, Task } from "@/types";

const formatDate = (value: string): string =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));

export function OperationsScreen() {
  const insets = useSafeAreaInsets();
  const { logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [handoffs, setHandoffs] = useState<HandoffQueueItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 350,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [taskData, handoffData] = await Promise.all([
        api.tasks(),
        api.handoffQueue(),
      ]);
      setTasks(taskData);
      setHandoffs(handoffData);
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
      setError(err instanceof Error ? err.message : "Falha ao carregar operações");
    } finally {
      setLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <Animated.View style={[styles.root, { opacity: fadeAnim }]}> 
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingBottom: Math.max(24, insets.bottom + 16),
          paddingHorizontal: 16,
        }}
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
        <Text style={styles.title}>Operações</Text>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Tarefas Abertas ({tasks.length})</Text>
        {tasks.length === 0 ? (
          <Text style={styles.emptyText}>Sem tarefas pendentes.</Text>
        ) : (
          tasks.slice(0, 8).map((task) => (
            <View style={styles.card} key={task.id}>
              <Text style={styles.cardTitle}>{task.title}</Text>
              <Text style={styles.cardMeta}>
                {task.contact.name ?? task.contact.waId} • {task.priority} • {task.status}
              </Text>
              <Text style={styles.cardMeta}>Prazo: {formatDate(task.dueAt)}</Text>
            </View>
          ))
        )}

        <Text style={[styles.sectionTitle, { marginTop: 18 }]}>Handoff Queue ({handoffs.length})</Text>
        {handoffs.length === 0 ? (
          <Text style={styles.emptyText}>Sem handoffs aguardando.</Text>
        ) : (
          handoffs.slice(0, 8).map((h) => (
            <View style={styles.card} key={h.waId}>
              <Text style={styles.cardTitle}>{h.name ?? h.waId}</Text>
              <Text style={styles.cardMeta}>
                Etapa: {h.stage?.name ?? "Sem etapa"} • SLA: {h.slaLevel}
              </Text>
              <Text style={styles.cardMeta}>Espera: {h.waitMinutes} min</Text>
            </View>
          ))
        )}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0f172a" },
  loader: {
    flex: 1,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: "#f1f5f9", fontSize: 24, fontWeight: "700", marginBottom: 12 },
  sectionTitle: { color: "#cbd5e1", fontSize: 16, fontWeight: "700", marginBottom: 8 },
  errorBox: {
    backgroundColor: "rgba(239,68,68,0.12)",
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  errorText: { color: "#fca5a5", fontSize: 13 },
  emptyText: { color: "#64748b", fontSize: 13, marginBottom: 8 },
  card: {
    backgroundColor: "#1e293b",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  cardTitle: { color: "#f1f5f9", fontSize: 14, fontWeight: "700", marginBottom: 4 },
  cardMeta: { color: "#94a3b8", fontSize: 12 },
});
