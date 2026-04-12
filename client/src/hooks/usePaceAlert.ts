/**
 * usePaceAlert
 *
 * Detects when a session's pace status transitions to "behind" and:
 *  1. Plays a two-tone alert via Web Audio API (kiosk mode only)
 *  2. Persists the alert to the server via pullAlerts.recordBehindAlert
 *  3. Marks recovery via pullAlerts.markRecovered when a session leaves "behind"
 *
 * Cooldown logic:
 *   After firing for a session, the hook records the timestamp. If the session
 *   recovers and then drops behind again, the alert will only re-fire once the
 *   cooldown window has elapsed.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";

export interface PaceSession {
  id: number | string;
  paceStatus: "ahead" | "on_pace" | "behind";
  /** Optional enrichment fields for the history record */
  associateName?: string | null;
  warehouseId?: string | null;
  pickTicket?: string | null;
  totalItems?: number | null;
  currentItemsPerHour?: number | null;
}

export interface UsePaceAlertOptions {
  /** Minimum ms between re-alerts for the same session. Default: 5 min. */
  cooldownMs?: number;
}

interface UsePaceAlertReturn {
  muted: boolean;
  toggleMute: () => void;
  /** Session IDs that are currently within their alert/cooldown window */
  alertedIds: Set<string>;
  /** Current cooldown duration in ms */
  cooldownMs: number;
  /** Update the cooldown duration */
  setCooldownMs: (ms: number) => void;
}

const MUTE_STORAGE_KEY = "kiosk_alert_muted";
const COOLDOWN_STORAGE_KEY = "kiosk_alert_cooldown_ms";
const DEFAULT_COOLDOWN_MS = 5 * 60_000; // 5 minutes

/** Play a two-descending-tone alert via Web Audio API */
function playBehindAlert(ctx: AudioContext) {
  const now = ctx.currentTime;

  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.connect(gain1);
  gain1.connect(ctx.destination);
  osc1.type = "sine";
  osc1.frequency.setValueAtTime(880, now);
  osc1.frequency.linearRampToValueAtTime(660, now + 0.25);
  gain1.gain.setValueAtTime(0.35, now);
  gain1.gain.linearRampToValueAtTime(0, now + 0.3);
  osc1.start(now);
  osc1.stop(now + 0.3);

  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.connect(gain2);
  gain2.connect(ctx.destination);
  osc2.type = "sine";
  osc2.frequency.setValueAtTime(660, now + 0.15);
  osc2.frequency.linearRampToValueAtTime(440, now + 0.45);
  gain2.gain.setValueAtTime(0, now + 0.15);
  gain2.gain.linearRampToValueAtTime(0.3, now + 0.2);
  gain2.gain.linearRampToValueAtTime(0, now + 0.5);
  osc2.start(now + 0.15);
  osc2.stop(now + 0.5);
}

export function usePaceAlert(
  sessions: PaceSession[],
  isKiosk: boolean,
  options: UsePaceAlertOptions = {}
): UsePaceAlertReturn {
  const [muted, setMuted] = useState<boolean>(() => {
    try { return localStorage.getItem(MUTE_STORAGE_KEY) === "true"; } catch { return false; }
  });

  const [cooldownMs, setCooldownMsState] = useState<number>(() => {
    if (options.cooldownMs !== undefined) return options.cooldownMs;
    try {
      const stored = localStorage.getItem(COOLDOWN_STORAGE_KEY);
      return stored ? parseInt(stored, 10) : DEFAULT_COOLDOWN_MS;
    } catch {
      return DEFAULT_COOLDOWN_MS;
    }
  });

  // Sync cooldownMs when the prop changes (e.g. server setting loaded)
  useEffect(() => {
    if (options.cooldownMs !== undefined) {
      setCooldownMsState(options.cooldownMs);
    }
  }, [options.cooldownMs]);

  const setCooldownMs = useCallback((ms: number) => {
    setCooldownMsState(ms);
    try { localStorage.setItem(COOLDOWN_STORAGE_KEY, String(ms)); } catch {}
  }, []);

  const prevBehindRef = useRef<Set<string>>(new Set());
  const lastAlertAtRef = useRef<Map<string, number>>(new Map());
  const [alertedIds, setAlertedIds] = useState<Set<string>>(new Set());

  // tRPC mutations for persisting alert history
  const recordBehindAlert = trpc.pullAlerts.recordBehindAlert.useMutation();
  const markRecovered = trpc.pullAlerts.markRecovered.useMutation();

  const audioCtxRef = useRef<AudioContext | null>(null);
  const getAudioCtx = useCallback((): AudioContext | null => {
    if (typeof window === "undefined") return null;
    if (!audioCtxRef.current) {
      try {
        audioCtxRef.current = new (window.AudioContext ||
          (window as any).webkitAudioContext)();
      } catch { return null; }
    }
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume().catch(() => {});
    }
    return audioCtxRef.current;
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      try { localStorage.setItem(MUTE_STORAGE_KEY, String(next)); } catch {}
      return next;
    });
  }, []);

  // Stable ref for sessions to avoid stale closures in the effect
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

  useEffect(() => {
    if (!isKiosk) return;

    const now = Date.now();
    const currentSessions = sessionsRef.current;

    const currentBehind = new Set<string>(
      currentSessions
        .filter((s) => s.paceStatus === "behind")
        .map((s) => String(s.id))
    );

    // Detect new "behind" transitions
    const toAlert: string[] = [];
    currentBehind.forEach((id) => {
      const wasAlreadyBehind = prevBehindRef.current.has(id);
      if (wasAlreadyBehind) return;

      const lastFired = lastAlertAtRef.current.get(id) ?? 0;
      if (now - lastFired >= cooldownMs) {
        toAlert.push(id);
      }
    });

    if (toAlert.length > 0) {
      toAlert.forEach((id) => lastAlertAtRef.current.set(id, now));

      setAlertedIds((prev) => {
        const next = new Set(prev);
        toAlert.forEach((id) => next.add(id));
        return next;
      });

      if (!muted) {
        const ctx = getAudioCtx();
        if (ctx) {
          try { playBehindAlert(ctx); } catch { /* ignore */ }
        }
      }

      // Persist each new alert to the server (fire-and-forget)
      toAlert.forEach((id) => {
        const session = currentSessions.find((s) => String(s.id) === id);
        recordBehindAlert.mutate({
          sessionId: id,
          associateName: session?.associateName ?? "",
          warehouseId: session?.warehouseId ?? "",
          pickTicket: session?.pickTicket ?? "",
          itemsAtAlert: session?.totalItems ?? 0,
          itemsPerHourAtAlert: session?.currentItemsPerHour ?? null,
        });
      });
    }

    // Detect recoveries: sessions that WERE behind but are no longer
    prevBehindRef.current.forEach((id) => {
      if (!currentBehind.has(id)) {
        // Session recovered or ended — mark it on the server
        markRecovered.mutate({ sessionId: id });
      }
    });

    // Prune alertedIds
    const activeIds = new Set(currentSessions.map((s) => String(s.id)));
    setAlertedIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (!activeIds.has(id)) { changed = true; return; }
        const lastFired = lastAlertAtRef.current.get(id) ?? 0;
        if (now - lastFired < cooldownMs) {
          next.add(id);
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });

    lastAlertAtRef.current.forEach((_, id) => {
      if (!activeIds.has(id)) lastAlertAtRef.current.delete(id);
    });

    prevBehindRef.current = currentBehind;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, isKiosk, muted, cooldownMs, getAudioCtx]);

  return { muted, toggleMute, alertedIds, cooldownMs, setCooldownMs };
}
