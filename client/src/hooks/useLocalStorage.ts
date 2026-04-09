import { useState, useEffect, useCallback } from "react";

/**
 * A drop-in replacement for useState that persists the value to localStorage.
 * - Reads the initial value from localStorage on mount (falls back to `initialValue`).
 * - Writes every state change back to localStorage.
 * - Handles JSON serialisation/deserialisation transparently.
 * - Safe against SSR / localStorage being unavailable.
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void, () => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item !== null ? (JSON.parse(item) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  // Keep localStorage in sync whenever the value changes
  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(storedValue));
    } catch {
      // Quota exceeded or private-browsing restrictions — fail silently
    }
  }, [key, storedValue]);

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setStoredValue((prev) =>
        typeof value === "function" ? (value as (prev: T) => T)(prev) : value
      );
    },
    []
  );

  /** Clears the key from localStorage and resets to initialValue */
  const removeValue = useCallback(() => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
    setStoredValue(initialValue);
  }, [key, initialValue]);

  return [storedValue, setValue, removeValue];
}
