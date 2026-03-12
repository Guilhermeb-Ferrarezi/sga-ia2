import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AxiosError } from "axios";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { useWebSocket } from "@/contexts/WebSocketContext";
import { api } from "@/services/api/client";
import type { DashboardTurn, PipelineContact, WsEventPayload } from "@/types";
import type { RootStackParamList } from "@/navigation/RootNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "Chat">;

const TURNS_PAGE_SIZE = 120;

const formatDateTime = (value: string): string =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));

const getErrorMessage = (err: unknown, fallback: string): string => {
  const axiosError = err as AxiosError<{ error?: string }>;
  return axiosError?.response?.data?.error ??
    (err instanceof Error ? err.message : fallback);
};

const findContactByWaId = (
  waId: string,
  contacts: PipelineContact[],
): PipelineContact | null => {
  const normalized = waId.trim();
  return contacts.find((c) => c.waId === normalized) ?? null;
};

export function ChatScreen({ route, navigation }: Props) {
  const { phone, contactName } = route.params;
  const insets = useSafeAreaInsets();
  const { logout } = useAuth();
  const { toast } = useToast();
  const { status, subscribeFiltered } = useWebSocket();

  const [turns, setTurns] = useState<DashboardTurn[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiProcessing, setAiProcessing] = useState(false);
  const [botEnabled, setBotEnabled] = useState(true);
  const [loadingBot, setLoadingBot] = useState(true);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const listRef = useRef<FlatList<DashboardTurn>>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 320,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const loadBotState = useCallback(async () => {
    setLoadingBot(true);
    try {
      const board = await api.pipelineBoard();
      const allContacts = [
        ...board.unassigned,
        ...board.stages.flatMap((stage) => stage.contacts),
      ];
      const contact = findContactByWaId(phone, allContacts);
      if (contact) {
        setBotEnabled(Boolean(contact.botEnabled));
      }
    } catch {
      // Keep previous local value if load fails
    } finally {
      setLoadingBot(false);
    }
  }, [phone]);

  const loadTurns = useCallback(
    async (opts?: { showLoader?: boolean }) => {
      if (opts?.showLoader) setLoading(true);
      try {
        const data = await api.conversationTurns(phone, TURNS_PAGE_SIZE);
        setTurns(data);
      } catch (err: unknown) {
        const axiosError = err as AxiosError;
        if (axiosError?.response?.status === 401) {
          logout();
          return;
        }
        toast({
          title: "Falha ao carregar chat",
          description: getErrorMessage(err, "Não foi possível carregar mensagens."),
          variant: "error",
        });
      } finally {
        setLoading(false);
      }
    },
    [phone, logout, toast],
  );

  useEffect(() => {
    void Promise.all([
      loadTurns({ showLoader: true }),
      loadBotState(),
    ]);
  }, [loadTurns, loadBotState]);

  const scheduleTurnsRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      void loadTurns();
      void loadBotState();
    }, 260);
  }, [loadTurns, loadBotState]);

  useEffect(
    () => () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (Platform.OS !== "android") return;

    const showSub = Keyboard.addListener("keyboardDidShow", (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    return subscribeFiltered(
      (event: WsEventPayload) => {
        if (event.type === "message:new" || event.type === "message:sent") {
          const content =
            typeof event.payload.content === "string"
              ? event.payload.content
              : "";
          const role =
            typeof event.payload.role === "string"
              ? event.payload.role
              : "assistant";

          if (content) {
            const newTurn: DashboardTurn = {
              id: `ws-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              role,
              content,
              createdAt: new Date().toISOString(),
            };
            setTurns((prev) => [...prev, newTurn]);
          }

          setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
          scheduleTurnsRefresh();
        }

        if (event.type === "ai:processing") setAiProcessing(true);

        if (event.type === "ai:done") {
          setAiProcessing(false);
          scheduleTurnsRefresh();
        }

        if (event.type === "contact:updated") {
          const incomingPhone =
            (event.payload.phone as string | undefined) ??
            (event.payload.waId as string | undefined);
          if (incomingPhone === phone && typeof event.payload.botEnabled === "boolean") {
            setBotEnabled(event.payload.botEnabled);
          }
        }
      },
      {
        types: [
          "message:new",
          "message:sent",
          "ai:processing",
          "ai:done",
          "contact:updated",
        ],
        waId: phone,
      },
    );
  }, [subscribeFiltered, phone, scheduleTurnsRefresh]);

  const toggleBot = async () => {
    const next = !botEnabled;
    setBotEnabled(next);
    try {
      await api.toggleBot(phone, next);
      toast({
        title: `Bot ${next ? "ativado" : "desativado"}`,
        variant: "success",
      });
    } catch (err) {
      setBotEnabled(!next);
      toast({
        title: "Falha ao atualizar bot",
        description: getErrorMessage(err, "Não foi possível salvar o estado do bot."),
        variant: "error",
      });
    }
  };

  const sendMessage = async () => {
    const content = messageText.trim();
    if (!content || botEnabled || sending) return;

    const optimisticTurn: DashboardTurn = {
      id: `local-${Date.now()}`,
      role: "assistant",
      content,
      createdAt: new Date().toISOString(),
    };

    setSending(true);
    setMessageText("");
    setTurns((prev) => [...prev, optimisticTurn]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);

    try {
      await api.sendMessage(phone, content);
    } catch (err: unknown) {
      setTurns((prev) => prev.filter((t) => t.id !== optimisticTurn.id));
      setMessageText(content);
      toast({
        title: "Mensagem não enviada",
        description: getErrorMessage(err, "Verifique conexão e permissões."),
        variant: "error",
      });
    } finally {
      setSending(false);
    }
  };

  const wsLabel = useMemo(() => {
    if (status === "connected") return "WS online";
    if (status === "reconnecting") return "WS reconectando";
    return "WS offline";
  }, [status]);

  useEffect(() => {
    navigation.setOptions({
      headerTitle: contactName ?? phone,
      headerRight: () => (
        <View style={styles.headerRightRow}>
          <View
            style={[
              styles.wsBadge,
              status === "connected"
                ? styles.wsBadgeOnline
                : status === "reconnecting"
                  ? styles.wsBadgeWarn
                  : styles.wsBadgeOffline,
            ]}
          >
            <Text style={styles.wsBadgeText}>{wsLabel}</Text>
          </View>
          <TouchableOpacity
            onPress={toggleBot}
            disabled={loadingBot}
            style={[
              styles.botBadge,
              { backgroundColor: botEnabled ? "#14532d" : "#7f1d1d" },
              loadingBot && { opacity: 0.6 },
            ]}
          >
            <Text style={[styles.botBadgeText, { color: "#f1f5f9" }]}>Bot {botEnabled ? "ON" : "OFF"}</Text>
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, contactName, phone, botEnabled, loadingBot, status, wsLabel]);

  const renderItem = ({ item }: { item: DashboardTurn }) => {
    const isAssistant = item.role === "assistant";
    return (
      <Animated.View
        style={[
          styles.bubble,
          isAssistant ? styles.bubbleAssistant : styles.bubbleUser,
          { opacity: fadeAnim },
        ]}
      >
        <Text
          style={[
            styles.bubbleText,
            { color: isAssistant ? "#e0e7ff" : "#e2e8f0" },
          ]}
        >
          {item.content}
        </Text>
        <Text style={styles.bubbleMeta}>
          {item.role} • {formatDateTime(item.createdAt)}
        </Text>
      </Animated.View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[
        styles.root,
        Platform.OS === "android" && keyboardHeight > 0
          ? { paddingBottom: keyboardHeight }
          : null,
      ]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      enabled={Platform.OS === "ios"}
      keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 58 : 0}
    >
      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#6366f1" />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={turns}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: 12 + insets.bottom },
          ]}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <Text style={styles.emptyText}>Sem mensagens para este contato.</Text>
          }
        />
      )}

      {aiProcessing ? (
        <View style={styles.aiBar}>
          <ActivityIndicator size="small" color="#6366f1" />
          <Text style={styles.aiBarText}>IA processando…</Text>
        </View>
      ) : null}

      <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 8) }]}> 
        <TextInput
          style={[styles.input, botEnabled && styles.inputDisabled]}
          placeholder={
            botEnabled
              ? "Bot ativo — desative para enviar"
              : "Digite sua mensagem…"
          }
          placeholderTextColor="#64748b"
          value={messageText}
          onChangeText={setMessageText}
          editable={!botEnabled && !sending}
          returnKeyType="send"
          blurOnSubmit={false}
          onSubmitEditing={() => {
            void sendMessage();
          }}
        />
        <TouchableOpacity
          style={[
            styles.sendBtn,
            (botEnabled || sending || !messageText.trim()) && styles.sendBtnDisabled,
          ]}
          onPress={() => {
            void sendMessage();
          }}
          disabled={botEnabled || sending || !messageText.trim()}
          activeOpacity={0.8}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.sendBtnText}>Enviar</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0a1330" },
  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: { paddingHorizontal: 12, paddingTop: 12 },
  emptyText: {
    color: "#64748b",
    fontSize: 13,
    textAlign: "center",
    marginTop: 40,
  },
  bubble: {
    maxWidth: "85%",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
  },
  bubbleUser: {
    alignSelf: "flex-start",
    backgroundColor: "#1e293b",
  },
  bubbleAssistant: {
    alignSelf: "flex-end",
    backgroundColor: "#4f46e5",
    shadowColor: "#4f46e5",
    shadowOpacity: 0.28,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  bubbleMeta: {
    color: "rgba(255,255,255,0.56)",
    fontSize: 10,
    marginTop: 4,
  },
  aiBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: "#1e293b",
    backgroundColor: "#0f172a",
  },
  aiBarText: { color: "#94a3b8", fontSize: 12 },
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#1e293b",
    backgroundColor: "#0f172a",
  },
  input: {
    flex: 1,
    backgroundColor: "#1e293b",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 12,
    color: "#f1f5f9",
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  inputDisabled: { opacity: 0.52 },
  sendBtn: {
    backgroundColor: "#6366f1",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  sendBtnDisabled: { opacity: 0.44 },
  sendBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  headerRightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  wsBadge: {
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  wsBadgeOnline: { backgroundColor: "rgba(16,185,129,0.2)" },
  wsBadgeWarn: { backgroundColor: "rgba(245,158,11,0.22)" },
  wsBadgeOffline: { backgroundColor: "rgba(239,68,68,0.22)" },
  wsBadgeText: { color: "#e2e8f0", fontSize: 10, fontWeight: "600" },
  botBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  botBadgeText: { fontSize: 12, fontWeight: "700" },
});
