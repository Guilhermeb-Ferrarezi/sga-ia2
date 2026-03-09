import { useRef, useCallback } from "react";
import { useToast } from "@/contexts/ToastContext";

interface UseRetryOptions {
  maxRetries?: number;
  delayMs?: number;
}

/**
 * Hook for retrying critical actions with toast feedback.
 * Returns a wrapper that auto-retries on failure and shows progress toasts.
 */
export function useRetry({ maxRetries = 2, delayMs = 1500 }: UseRetryOptions = {}) {
  const { toast } = useToast();
  const busyRef = useRef(false);

  const run = useCallback(
    async <T,>(
      action: () => Promise<T>,
      opts?: { actionLabel?: string; successLabel?: string },
    ): Promise<T | undefined> => {
      if (busyRef.current) return undefined;
      busyRef.current = true;
      const label = opts?.actionLabel ?? "Ação";
      let lastError: unknown;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          if (attempt > 0) {
            toast({
              title: `${label} — tentativa ${attempt + 1}/${maxRetries + 1}`,
              variant: "info",
              durationMs: delayMs,
            });
          }
          const result = await action();
          toast({
            title: opts?.successLabel ?? `${label} concluída`,
            variant: "success",
          });
          busyRef.current = false;
          return result;
        } catch (err) {
          lastError = err;
          if (attempt < maxRetries) {
            await new Promise((r) => setTimeout(r, delayMs));
          }
        }
      }

      toast({
        title: `${label} falhou`,
        description:
          lastError instanceof Error ? lastError.message : "Tente novamente mais tarde.",
        variant: "error",
      });
      busyRef.current = false;
      return undefined;
    },
    [maxRetries, delayMs, toast],
  );

  return { run, busy: busyRef };
}
