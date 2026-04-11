/**
 * usePaceAlert
 *
 * Detects when a session's pace status transitions to "behind" and plays a
 * two-tone alert using the Web Audio API (no audio file required).
 *
 * Cooldown logic:
 *   After firing for a session, the hook records the timestamp. If the session
 *   recovers and then drops behind again, the alert will only re-fire once the
 *   cooldown window has elapsed. This prevents alert fatigue on borderline
 *   sessions that oscillate around the pace threshold.
 *
 * Usage:
 *   const { muted, toggleMute, alertedIds, cooldownMs, setCooldownMs } =
 *     usePaceAlert(sessions, isKiosk, { cooldownMs: 5 * 60_000 });
 *
 * - `sessions`    — the live session array from getActiveSessions
 * - `isKiosk`     — only fires alerts when kiosk mode is active
 * - `cooldownMs`  — minimum ms between alerts for the same session (default 5 min)
 * - `muted`       — current mute state (persisted to localStorage)
 * - `toggleMute`  — flip mute on/off
 * - `alertedIds`  — Set of session IDs currently in their alert/cooldown window
 * - `setCooldownMs` — update the cooldown duration at runtime
 */
import { useCallback, useEffect, useRef, useState } from "react";

export interface PaceSession {
  id: number | string;
  paceStatus: "ahead" | "on_pace" | "behind";
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

  // First tone: 880 Hz → 660 Hz over 0.25 s
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

  // Second tone: 660 Hz → 440 Hz, starts 0.15 s later
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

  const setCooldownMs = useCallback((ms: number) => {
    setCooldownMsState(ms);
    try { localStorage.setItem(COOLDOWN_STORAGE_KEY, String(ms)); } catch {}
  }, []);

  // prevBehindRef: set of session IDs that were "behind" on the last render
  const prevBehindRef = useRef<Set<string>>(new Set());

  // lastAlertAt: maps session ID → timestamp (ms) of the most recent alert fired
  const lastAlertAtRef = useRef<Map<string, number>>(new Map());

  // alertedIds: IDs currently within their cooldown window (shown with red ring)
  const [alertedIds, setAlertedIds] = useState<Set<string>>(new Set());

  // Lazy AudioContext
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

  useEffect(() => {
    if (!isKiosk) return;

    const now = Date.now();

    const currentBehind = new Set<string>(
      sessions
        .filter((s) => s.paceStatus === "behind")
        .map((s) => String(s.id))
    );

    // Find IDs that just transitioned into "behind" AND are not within cooldown
    const toAlert: string[] = [];
    currentBehind.forEach((id) => {
      const wasAlreadyBehind = prevBehindRef.current.has(id);
      if (wasAlreadyBehind) return; // still behind from last tick — no new transition

      // New "behind" transition — check cooldown
      const lastFired = lastAlertAtRef.current.get(id) ?? 0;
      const elapsed = now - lastFired;
      if (elapsed >= cooldownMs) {
        toAlert.push(id);
      }
      // If within cooldown, silently skip — no alert, no ring update
    });

    if (toAlert.length > 0) {
      const firedAt = now;
      toAlert.forEach((id) => lastAlertAtRef.current.set(id, firedAt));

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
    }

    // Prune alertedIds: remove IDs no longer active OR whose cooldown has expired
    const activeIds = new Set(sessions.map((s) => String(s.id)));
    setAlertedIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (!activeIds.has(id)) { changed = true; return; } // session ended
        const lastFired = lastAlertAtRef.current.get(id) ?? 0;
        if (now - lastFired < cooldownMs) {
          next.add(id); // still within cooldown window — keep ring
        } else {
          changed = true; // cooldown expired — remove ring
        }
      });
      return changed ? next : prev;
    });

    // Also clean up lastAlertAt for sessions that have ended
    lastAlertAtRef.current.forEach((_, id) => {
      if (!activeIds.has(id)) lastAlertAtRef.current.delete(id);
    });

    prevBehindRef.current = currentBehind;
  }, [sessions, isKiosk, muted, cooldownMs, getAudioCtx]);

  return { muted, toggleMute, alertedIds, cooldownMs, setCooldownMs };
}
