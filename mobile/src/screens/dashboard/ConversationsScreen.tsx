import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { useWebSocket } from "@/contexts/WebSocketContext";
import { api } from "@/services/api/client";
import type { DashboardConversation } from "@/types";
import type { RootStackParamList } from "@/navigation/RootNavigator";

type Nav = NativeStackNavigationProp<RootStackParamList, "Conversations">;

const formatDate = (value: string): string =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));

export function ConversationsScreen() {
  const insets = useSafeAreaInsets();
  const { logout } = useAuth();
  const { subscribeFiltered } = useWebSocket();
  const navigation = useNavigation<Nav>();
  const [conversations, setConversations] = useState<DashboardConversation[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 320,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api.conversations(60);
      setConversations(data);
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

  useEffect(() => {
    return subscribeFiltered(
      () => {
        void load();
      },
      {
        types: [
          "message:new",
          "message:sent",
          "contact:updated",
          "contact:deleted",
        ],
      },
    );
  }, [subscribeFiltered, load]);

  const openChat = (phone: string, name: string | null) => {
    navigation.navigate("Chat", { phone, contactName: name ?? undefined });
  };

  const renderItem = ({ item }: { item: DashboardConversation }) => (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.7}
      onPress={() => openChat(item.phone, item.name)}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {(item.name ?? item.phone).charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.rowBody}>
        <View style={styles.rowHeader}>
          <Text style={styles.rowName} numberOfLines={1}>
            {item.name ?? item.phone}
          </Text>
          <Text style={styles.rowDate}>{formatDate(item.lastMessageAt)}</Text>
        </View>
        <Text style={styles.rowPreview} numberOfLines={1}>
          {item.lastMessagePreview}
        </Text>
        <Text style={styles.rowCount}>{item.messagesCount} msgs</Text>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <Animated.View style={[styles.root, { paddingTop: insets.top + 8, opacity: fadeAnim }]}>
      <Text style={styles.title}>Conversas</Text>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <FlatList
        data={conversations}
        keyExtractor={(item) => item.phone}
        renderItem={renderItem}
        keyboardDismissMode="on-drag"
        contentContainerStyle={[
          styles.list,
          { paddingBottom: Math.max(insets.bottom, 16) + 24 },
        ]}
        ListEmptyComponent={
          <Text style={styles.emptyText}>Nenhuma conversa ainda.</Text>
        }
      />
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
  title: {
    color: "#f1f5f9",
    fontSize: 22,
    fontWeight: "700",
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  errorBox: {
    backgroundColor: "rgba(239,68,68,0.12)",
    borderRadius: 8,
    padding: 10,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  errorText: { color: "#fca5a5", fontSize: 13 },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  emptyText: { color: "#64748b", fontSize: 13, textAlign: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#6366f1",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  avatarText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  rowBody: { flex: 1 },
  rowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  rowName: { color: "#f1f5f9", fontSize: 14, fontWeight: "600", flex: 1 },
  rowDate: { color: "#64748b", fontSize: 11 },
  rowPreview: { color: "#94a3b8", fontSize: 13, marginBottom: 2 },
  rowCount: { color: "#475569", fontSize: 11 },
});
