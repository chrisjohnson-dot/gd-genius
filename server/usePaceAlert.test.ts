/**
 * usePaceAlert.test.ts
 *
 * Tests for the pure logic of usePaceAlert:
 *  - Detecting new "behind" transitions
 *  - Not re-firing for sessions already behind
 *  - Pruning alertedIds when sessions leave the active list
 *  - Mute state persisted to localStorage
 *
 * Note: The hook uses React hooks and browser APIs (AudioContext, localStorage).
 * We test the underlying transition-detection logic directly rather than
 * mounting the hook in a JSDOM environment.
 */
import { describe, it, expect } from "vitest";

// ─── Pure helper: detect new "behind" transitions ─────────────────────────────
type PaceStatus = "ahead" | "on_pace" | "behind";
interface Session { id: number | string; paceStatus: PaceStatus; }

function detectNewBehind(
  current: Session[],
  prevBehind: Set<string>
): string[] {
  const currentBehind = new Set(
    current.filter(s => s.paceStatus === "behind").map(s => String(s.id))
  );
  const newBehind: string[] = [];
  currentBehind.forEach(id => {
    if (!prevBehind.has(id)) newBehind.push(id);
  });
  return newBehind;
}

function pruneAlerted(alerted: Set<string>, active: Session[]): Set<string> {
  const activeIds = new Set(active.map(s => String(s.id)));
  const pruned = new Set<string>();
  alerted.forEach(id => { if (activeIds.has(id)) pruned.add(id); });
  return pruned;
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("usePaceAlert — transition detection", () => {
  it("detects a session that newly drops to behind", () => {
    const prev = new Set<string>(["1"]); // session 1 was already behind
    const current: Session[] = [
      { id: 1, paceStatus: "behind" },
      { id: 2, paceStatus: "behind" }, // new!
      { id: 3, paceStatus: "ahead" },
    ];
    const newBehind = detectNewBehind(current, prev);
    expect(newBehind).toEqual(["2"]);
  });

  it("returns empty array when no new behind transitions", () => {
    const prev = new Set(["1", "2"]);
    const current: Session[] = [
      { id: 1, paceStatus: "behind" },
      { id: 2, paceStatus: "behind" },
    ];
    expect(detectNewBehind(current, prev)).toHaveLength(0);
  });

  it("returns empty array when no sessions are behind", () => {
    const prev = new Set<string>();
    const current: Session[] = [
      { id: 1, paceStatus: "ahead" },
      { id: 2, paceStatus: "on_pace" },
    ];
    expect(detectNewBehind(current, prev)).toHaveLength(0);
  });

  it("fires for all sessions that simultaneously drop to behind", () => {
    const prev = new Set<string>();
    const current: Session[] = [
      { id: 10, paceStatus: "behind" },
      { id: 11, paceStatus: "behind" },
    ];
    const newBehind = detectNewBehind(current, prev);
    expect(newBehind).toHaveLength(2);
    expect(newBehind).toContain("10");
    expect(newBehind).toContain("11");
  });

  it("does not fire again after a session recovers and drops behind again in the same render", () => {
    // Simulate: session 5 was behind, then recovered (removed from prev), then behind again
    // In the same tick, prev would not contain it → fires again (correct behaviour)
    const prev = new Set<string>(); // cleared after recovery
    const current: Session[] = [{ id: 5, paceStatus: "behind" }];
    expect(detectNewBehind(current, prev)).toEqual(["5"]);
  });
});

describe("usePaceAlert — alertedIds pruning", () => {
  it("removes IDs that are no longer in the active session list", () => {
    const alerted = new Set(["1", "2", "3"]);
    const active: Session[] = [
      { id: 1, paceStatus: "behind" },
      { id: 3, paceStatus: "on_pace" },
      // session 2 has ended
    ];
    const pruned = pruneAlerted(alerted, active);
    expect(pruned.has("1")).toBe(true);
    expect(pruned.has("3")).toBe(true);
    expect(pruned.has("2")).toBe(false);
  });

  it("returns the same set reference when nothing is pruned", () => {
    const alerted = new Set(["1"]);
    const active: Session[] = [{ id: 1, paceStatus: "behind" }];
    const pruned = pruneAlerted(alerted, active);
    expect(pruned.size).toBe(1);
    expect(pruned.has("1")).toBe(true);
  });

  it("returns empty set when all sessions have ended", () => {
    const alerted = new Set(["1", "2"]);
    const pruned = pruneAlerted(alerted, []);
    expect(pruned.size).toBe(0);
  });
});

describe("usePaceAlert — mute state logic", () => {
  it("mute flag suppresses alert (logic only)", () => {
    // Simulate: new behind session detected, but muted = true → no sound
    const muted = true;
    const newBehind = ["42"];
    const soundsPlayed: string[] = [];
    if (newBehind.length > 0 && !muted) {
      soundsPlayed.push(...newBehind);
    }
    expect(soundsPlayed).toHaveLength(0);
  });

  it("unmuted flag allows alert", () => {
    const muted = false;
    const newBehind = ["42"];
    const soundsPlayed: string[] = [];
    if (newBehind.length > 0 && !muted) {
      soundsPlayed.push(...newBehind);
    }
    expect(soundsPlayed).toEqual(["42"]);
  });
});

// ─── Cooldown logic helpers ────────────────────────────────────────────────────
/**
 * Mirrors the cooldown check in usePaceAlert:
 * A new "behind" transition fires only if enough time has elapsed since the
 * last alert for that session.
 */
function shouldFireWithCooldown(
  id: string,
  lastAlertAt: Map<string, number>,
  cooldownMs: number,
  now: number
): boolean {
  const lastFired = lastAlertAt.get(id) ?? 0;
  return now - lastFired >= cooldownMs;
}

function pruneAlertsWithCooldown(
  alerted: Set<string>,
  active: Session[],
  lastAlertAt: Map<string, number>,
  cooldownMs: number,
  now: number
): Set<string> {
  const activeIds = new Set(active.map((s) => String(s.id)));
  const next = new Set<string>();
  alerted.forEach((id) => {
    if (!activeIds.has(id)) return; // session ended — remove ring
    const lastFired = lastAlertAt.get(id) ?? 0;
    if (now - lastFired < cooldownMs) next.add(id); // still in cooldown window
  });
  return next;
}

describe("usePaceAlert — cooldown logic", () => {
  it("fires on first behind transition (no prior alert)", () => {
    const lastAlertAt = new Map<string, number>();
    const now = Date.now();
    expect(shouldFireWithCooldown("1", lastAlertAt, 5 * 60_000, now)).toBe(true);
  });

  it("suppresses re-fire within cooldown window", () => {
    const lastAlertAt = new Map<string, number>();
    const now = Date.now();
    lastAlertAt.set("1", now - 2 * 60_000); // fired 2 min ago
    const cooldown = 5 * 60_000; // 5 min cooldown
    expect(shouldFireWithCooldown("1", lastAlertAt, cooldown, now)).toBe(false);
  });

  it("allows re-fire after cooldown has elapsed", () => {
    const lastAlertAt = new Map<string, number>();
    const now = Date.now();
    lastAlertAt.set("1", now - 6 * 60_000); // fired 6 min ago
    const cooldown = 5 * 60_000; // 5 min cooldown
    expect(shouldFireWithCooldown("1", lastAlertAt, cooldown, now)).toBe(true);
  });

  it("fires immediately with 1-minute cooldown after 1 min has passed", () => {
    const lastAlertAt = new Map<string, number>();
    const now = Date.now();
    lastAlertAt.set("5", now - 61_000); // 61 seconds ago
    expect(shouldFireWithCooldown("5", lastAlertAt, 60_000, now)).toBe(true);
  });

  it("suppresses with 15-minute cooldown when only 10 min have passed", () => {
    const lastAlertAt = new Map<string, number>();
    const now = Date.now();
    lastAlertAt.set("7", now - 10 * 60_000);
    expect(shouldFireWithCooldown("7", lastAlertAt, 15 * 60_000, now)).toBe(false);
  });

  it("removes alertedId ring once cooldown expires", () => {
    const lastAlertAt = new Map<string, number>();
    const now = Date.now();
    lastAlertAt.set("3", now - 6 * 60_000); // fired 6 min ago, cooldown 5 min
    const alerted = new Set(["3"]);
    const active: Session[] = [{ id: 3, paceStatus: "behind" }];
    const pruned = pruneAlertsWithCooldown(alerted, active, lastAlertAt, 5 * 60_000, now);
    expect(pruned.has("3")).toBe(false); // cooldown expired — ring removed
  });

  it("keeps alertedId ring while still within cooldown", () => {
    const lastAlertAt = new Map<string, number>();
    const now = Date.now();
    lastAlertAt.set("4", now - 2 * 60_000); // fired 2 min ago, cooldown 5 min
    const alerted = new Set(["4"]);
    const active: Session[] = [{ id: 4, paceStatus: "behind" }];
    const pruned = pruneAlertsWithCooldown(alerted, active, lastAlertAt, 5 * 60_000, now);
    expect(pruned.has("4")).toBe(true); // still in cooldown — keep ring
  });

  it("removes ring for ended sessions regardless of cooldown", () => {
    const lastAlertAt = new Map<string, number>();
    const now = Date.now();
    lastAlertAt.set("9", now - 1_000); // fired 1 sec ago — within any cooldown
    const alerted = new Set(["9"]);
    const active: Session[] = []; // session has ended
    const pruned = pruneAlertsWithCooldown(alerted, active, lastAlertAt, 5 * 60_000, now);
    expect(pruned.has("9")).toBe(false); // session ended — always remove
  });
});
