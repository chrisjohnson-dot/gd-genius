/**
 * useScanAudio
 *
 * Provides two audio feedback functions for the QC scanner:
 *   - playSuccess(): short, pleasant high-pitched beep for a valid scan
 *   - playError():   harsh descending buzz for any error condition
 *                    (over-scan, item not on list, over-weight, etc.)
 *
 * Uses the Web Audio API (AudioContext) — no external files required.
 * Silently no-ops if AudioContext is unavailable (e.g. SSR, blocked by browser).
 */

function getAudioContext(): AudioContext | null {
  try {
    return new AudioContext();
  } catch {
    return null;
  }
}

/** Single-tone helper */
function playTone(
  ctx: AudioContext,
  type: OscillatorType,
  freq: number,
  startOffset: number,
  duration: number,
  gainPeak: number
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + startOffset);
  gain.gain.setValueAtTime(gainPeak, ctx.currentTime + startOffset);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startOffset + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime + startOffset);
  osc.stop(ctx.currentTime + startOffset + duration);
}

export function useScanAudio() {
  /**
   * Success: two quick ascending sine tones — clean, pleasant, unobtrusive.
   * ~300 ms total.
   */
  const playSuccess = () => {
    const ctx = getAudioContext();
    if (!ctx) return;
    playTone(ctx, "sine", 880, 0,    0.08, 0.30);
    playTone(ctx, "sine", 1320, 0.10, 0.12, 0.25);
    setTimeout(() => ctx.close(), 500);
  };

  /**
   * Error: three descending square-wave pulses — harsh and attention-grabbing.
   * ~700 ms total. Used for ALL error conditions:
   *   - item not found / not on list
   *   - over-scan (already at 100%)
   *   - over-weight limit
   */
  const playError = () => {
    const ctx = getAudioContext();
    if (!ctx) return;
    playTone(ctx, "square", 440, 0,    0.15, 0.40);
    playTone(ctx, "square", 330, 0.20, 0.15, 0.35);
    playTone(ctx, "square", 220, 0.40, 0.22, 0.30);
    setTimeout(() => ctx.close(), 1000);
  };

  return { playSuccess, playError };
}
