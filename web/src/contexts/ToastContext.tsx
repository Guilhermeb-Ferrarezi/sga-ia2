import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type ToastVariant = "info" | "success" | "error";

interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastInput {
  title: string;
  description?: string;
  variant?: ToastVariant;
  durationMs?: number;
}

interface ToastContextValue {
  toast: (input: ToastInput) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const variantStyles: Record<ToastVariant, string> = {
  info: "border-primary/30 bg-card/95 text-foreground",
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
  error: "border-destructive/40 bg-destructive/10 text-destructive-foreground",
};

const variantIcon: Record<ToastVariant, JSX.Element> = {
  info: <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />,
  success: <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />,
  error: <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismissToast = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    const timeout = timersRef.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      timersRef.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    ({
      title,
      description,
      variant = "info",
      durationMs = 4200,
    }: ToastInput) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const next: ToastItem = { id, title, description, variant };

      setItems((prev) => [...prev.slice(-4), next]);

      const timeout = setTimeout(() => {
        dismissToast(id);
      }, durationMs);
      timersRef.current.set(id, timeout);
    },
    [dismissToast],
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timeout of timers.values()) {
        clearTimeout(timeout);
      }
      timers.clear();
    };
  }, []);

  const value = useMemo(
    () => ({
      toast,
      dismissToast,
    }),
    [toast, dismissToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-3 top-3 z-[100] flex w-[min(92vw,360px)] flex-col gap-2 sm:right-5 sm:top-5">
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "pointer-events-auto rounded-xl border p-3 shadow-xl backdrop-blur-sm transition",
              "animate-fade-up",
              variantStyles[item.variant],
            )}
            role="status"
          >
            <div className="flex items-start gap-2">
              {variantIcon[item.variant]}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{item.title}</p>
                {item.description && (
                  <p className="mt-0.5 text-xs text-current/85">{item.description}</p>
                )}
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-6 w-6 rounded-md"
                onClick={() => dismissToast(item.id)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
