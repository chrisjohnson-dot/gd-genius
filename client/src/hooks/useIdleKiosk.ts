/**
 * useIdleKiosk.ts
 * Detects user inactivity on the Live Pull Board and auto-enters kiosk mode
 * after IDLE_TIMEOUT_MS of no mouse/keyboard/touch/scroll activity.
 *
 * Features:
 * - Enabled/disabled toggle persisted to localStorage
 * - Visible countdown during the last COUNTDOWN_SECONDS before auto-enter
 * - Activity on any of: mousemove, mousedown, keydown, touchstart, scroll resets the timer
 * - Exposes: { autoKioskEnabled, toggleAutoKiosk, secondsUntilKiosk, isCountingDown }
 */
import { useState, useEffect, useRef, useCallback } from "react";

const IDLE_TIMEOUT_MS = 60_000;       // 60 seconds total idle time
const COUNTDOWN_SECONDS = 10;         // show countdown for last 10 seconds
const STORAGE_KEY = "liveboard:autoKiosk";

const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "touchstart",
  "scroll",
  "wheel",
] as const;

interface UseIdleKioskOptions {
  /** Called when the idle timer expires and kiosk mode should be entered */
  onEnterKiosk: () => void;
  /** Whether the Live Board page is currently active (pauses timer when false) */
  active?: boolean;
}

interface UseIdleKioskResult {
  autoKioskEnabled: boolean;
  toggleAutoKiosk: () => void;
  /** Seconds remaining until auto-enter (only meaningful when isCountingDown is true) */
  secondsUntilKiosk: number;
  /** True when within the last COUNTDOWN_SECONDS of the idle timer */
  isCountingDown: boolean;
  /** Reset the idle timer manually (e.g., when user interacts via tRPC) */
  resetTimer: () => void;
}

export function useIdleKiosk({
  onEnterKiosk,
  active = true,
}: UseIdleKioskOptions): UseIdleKioskResult {
  // Persist enabled state to localStorage
  const [autoKioskEnabled, setAutoKioskEnabled] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === null ? true : stored === "true"; // default ON
    } catch {
      return true;
    }
  });

  const [secondsUntilKiosk, setSecondsUntilKiosk] = useState(
    Math.ceil(IDLE_TIMEOUT_MS / 1000)
  );
  const [isCountingDown, setIsCountingDown] = useState(false);

  // Refs to avoid stale closures in event handlers
  const lastActivityRef = useRef<number>(Date.now());
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const enabledRef = useRef(autoKioskEnabled);
  const activeRef = useRef(active);
  const onEnterKioskRef = useRef(onEnterKiosk);

  // Keep refs in sync
  useEffect(() => { enabledRef.current = autoKioskEnabled; }, [autoKioskEnabled]);
  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => { onEnterKioskRef.current = onEnterKiosk; }, [onEnterKiosk]);

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    setIsCountingDown(false);
    setSecondsUntilKiosk(Math.ceil(IDLE_TIMEOUT_MS / 1000));
  }, []);

  const toggleAutoKiosk = useCallback(() => {
    setAutoKioskEnabled((prev) => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, String(next)); } catch { /* ignore */ }
      if (next) resetTimer(); // reset timer when re-enabling
      return next;
    });
  }, [resetTimer]);

  // Activity listener — resets the idle timer on any user interaction
  useEffect(() => {
    if (!active) return;

    function handleActivity() {
      lastActivityRef.current = Date.now();
      if (enabledRef.current) {
        setIsCountingDown(false);
        setSecondsUntilKiosk(Math.ceil(IDLE_TIMEOUT_MS / 1000));
      }
    }

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, handleActivity, { passive: true });
    }
    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, handleActivity);
      }
    };
  }, [active]);

  // 1-second ticker — checks elapsed time and triggers kiosk or countdown
  useEffect(() => {
    if (!active) {
      if (tickerRef.current) clearInterval(tickerRef.current);
      return;
    }

    tickerRef.current = setInterval(() => {
      if (!enabledRef.current) {
        setIsCountingDown(false);
        setSecondsUntilKiosk(Math.ceil(IDLE_TIMEOUT_MS / 1000));
        return;
      }

      const elapsed = Date.now() - lastActivityRef.current;
      const remaining = Math.max(0, IDLE_TIMEOUT_MS - elapsed);
      const secs = Math.ceil(remaining / 1000);

      setSecondsUntilKiosk(secs);
      setIsCountingDown(secs <= COUNTDOWN_SECONDS && secs > 0);

      if (remaining <= 0) {
        // Reset before calling so the hook is clean if the user immediately exits kiosk
        lastActivityRef.current = Date.now();
        setIsCountingDown(false);
        setSecondsUntilKiosk(Math.ceil(IDLE_TIMEOUT_MS / 1000));
        onEnterKioskRef.current();
      }
    }, 1000);

    return () => {
      if (tickerRef.current) clearInterval(tickerRef.current);
    };
  }, [active]);

  return {
    autoKioskEnabled,
    toggleAutoKiosk,
    secondsUntilKiosk,
    isCountingDown,
    resetTimer,
  };
}
