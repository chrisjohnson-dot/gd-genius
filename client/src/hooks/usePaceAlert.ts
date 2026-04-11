/**
 * usePaceAlert
 *
 * Detects when a session's pace status transitions to "behind" for the first
 * time in the current render cycle and plays a two-tone alert using the Web
 * Audio API (no audio file required).
 *
 * Usage:
 *   const { muted, toggleMute, alertedIds } = usePaceAlert(sessions, isKiosk);
 *
 * - `sessions`  — the live session array from getActiveSessions
 * - `isKiosk`   — only fires alerts when kiosk mode is active
 * - `muted`     — current mute state (persisted to localStorage)
 * - `toggleMute`— flip mute on/off
 * - `alertedIds`— Set of session IDs that have triggered an alert this session
 *                 (cleared when a session leaves the active list)
 */
import { useCallback, useEffect, useRef, useState } from "react";

export interface PaceSession {
  id: number | string;
  paceStatus: "ahead" | "on_pace" | "behind";
}

interface UsePaceAlertReturn {
  muted: boolean;
  toggleMute: () => void;
  alertedIds: Set<string>;
}

const STORAGE_KEY = "kiosk_alert_muted";

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
  isKiosk: boolean
): UsePaceAlertReturn {
  const [muted, setMuted] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  // Track which session IDs are currently "behind" so we only fire once per
  // transition (not on every re-render while they remain behind).
  const prevBehindRef = useRef<Set<string>>(new Set());

  // Track all IDs that have ever triggered an alert in this browser session
  const [alertedIds, setAlertedIds] = useState<Set<string>>(new Set());

  // Lazy AudioContext — created on first alert to comply with autoplay policy
  const audioCtxRef = useRef<AudioContext | null>(null);

  const getAudioCtx = useCallback((): AudioContext | null => {
    if (typeof window === "undefined") return null;
    if (!audioCtxRef.current) {
      try {
        audioCtxRef.current = new (window.AudioContext ||
          (window as any).webkitAudioContext)();
      } catch {
        return null;
      }
    }
    // Resume if suspended (browsers suspend after user inactivity)
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume().catch(() => {});
    }
    return audioCtxRef.current;
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {}
      return next;
    });
  }, []);

  useEffect(() => {
    if (!isKiosk) return;

    const currentBehind = new Set<string>(
      sessions
        .filter((s) => s.paceStatus === "behind")
        .map((s) => String(s.id))
    );

    // Find IDs that just transitioned into "behind" (not in previous set)
    const newBehind: string[] = [];
    currentBehind.forEach((id) => {
      if (!prevBehindRef.current.has(id)) {
        newBehind.push(id);
      }
    });

    if (newBehind.length > 0) {
      // Update alerted IDs
      setAlertedIds((prev) => {
        const next = new Set(prev);
        newBehind.forEach((id) => next.add(id));
        return next;
      });

      // Play sound unless muted
      if (!muted) {
        const ctx = getAudioCtx();
        if (ctx) {
          try {
            playBehindAlert(ctx);
          } catch {
            // Silently ignore audio errors (e.g., browser policy)
          }
        }
      }
    }

    // Prune alertedIds for sessions that have left the active list
    const activeIds = new Set(sessions.map((s) => String(s.id)));
    setAlertedIds((prev) => {
      const pruned = new Set<string>();
      prev.forEach((id) => { if (activeIds.has(id)) pruned.add(id); });
      return pruned.size === prev.size ? prev : pruned;
    });

    prevBehindRef.current = currentBehind;
  }, [sessions, isKiosk, muted, getAudioCtx]);

  return { muted, toggleMute, alertedIds };
}
