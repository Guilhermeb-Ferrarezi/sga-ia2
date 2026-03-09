import { useState, useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Persists filter values to localStorage keyed by userId + pageKey.
 * Restores saved values on mount. Writes on every change.
 */
export function useSavedFilters<T extends Record<string, unknown>>(
  pageKey: string,
  defaults: T,
): [T, <K extends keyof T>(key: K, value: T[K]) => void, () => void] {
  const { user } = useAuth();
  const storageKey = `filters:${user?.id ?? "anon"}:${pageKey}`;
  const initialized = useRef(false);

  const [filters, setFilters] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<T>;
        return { ...defaults, ...parsed };
      }
    } catch {
      // ignore corrupted data
    }
    return defaults;
  });

  // Persist on every change (after initial load)
  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      return;
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify(filters));
    } catch {
      // quota exceeded — silently ignore
    }
  }, [filters, storageKey]);

  const setFilter = useCallback(
    <K extends keyof T>(key: K, value: T[K]) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const resetFilters = useCallback(() => {
    setFilters(defaults);
    localStorage.removeItem(storageKey);
  }, [defaults, storageKey]);

  return [filters, setFilter, resetFilters];
}
