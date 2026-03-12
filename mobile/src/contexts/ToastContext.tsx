import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ToastInput, ToastVariant } from "@/types";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (input: ToastInput) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const variantColors: Record<ToastVariant, { bg: string; border: string; text: string }> = {
  info: { bg: "#1e293b", border: "#3b82f6", text: "#e2e8f0" },
  success: { bg: "#064e3b", border: "#10b981", text: "#d1fae5" },
  error: { bg: "#450a0a", border: "#ef4444", text: "#fecaca" },
};

function ToastItemView({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: string) => void;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const colors = variantColors[item.variant];

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.toastItem,
        { backgroundColor: colors.bg, borderColor: colors.border, opacity },
      ]}
    >
      <View style={styles.toastContent}>
        <Text style={[styles.toastTitle, { color: colors.text }]}>
          {item.title}
        </Text>
        {item.description ? (
          <Text style={[styles.toastDesc, { color: colors.text }]}>
            {item.description}
          </Text>
        ) : null}
      </View>
      <TouchableOpacity onPress={() => onDismiss(item.id)} hitSlop={8}>
        <Text style={{ color: colors.text, fontSize: 16 }}>✕</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const dismissToast = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    const timeout = timersRef.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      timersRef.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    ({ title, description, variant = "info", durationMs = 4200 }: ToastInput) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const next: ToastItem = { id, title, description, variant };
      setItems((prev) => [...prev.slice(-4), next]);

      const timeout = setTimeout(() => dismissToast(id), durationMs);
      timersRef.current.set(id, timeout);
    },
    [dismissToast],
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  const value = useMemo(() => ({ toast, dismissToast }), [toast, dismissToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <View style={styles.container} pointerEvents="box-none">
        {items.map((item) => (
          <ToastItemView key={item.id} item={item} onDismiss={dismissToast} />
        ))}
      </View>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 50,
    right: 12,
    left: 12,
    zIndex: 9999,
    gap: 8,
  },
  toastItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  toastContent: {
    flex: 1,
    marginRight: 8,
  },
  toastTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  toastDesc: {
    fontSize: 12,
    marginTop: 2,
    opacity: 0.85,
  },
});
