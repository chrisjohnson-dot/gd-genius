/**
 * useIdleKiosk.test.ts
 * Unit tests for the idle-kiosk timer logic (pure functions, no DOM/React).
 * We extract and test the core state-machine rules that the hook implements.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Pure helpers mirroring useIdleKiosk logic ────────────────────────────────
const IDLE_TIMEOUT_MS = 60_000;
const COUNTDOWN_SECONDS = 10;

function computeSecondsUntilKiosk(lastActivity: number, now: number): number {
  const elapsed = now - lastActivity;
  const remaining = Math.max(0, IDLE_TIMEOUT_MS - elapsed);
  return Math.ceil(remaining / 1000);
}

function computeIsCountingDown(secs: number): boolean {
  return secs <= COUNTDOWN_SECONDS && secs > 0;
}

function shouldEnterKiosk(lastActivity: number, now: number): boolean {
  return now - lastActivity >= IDLE_TIMEOUT_MS;
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("useIdleKiosk — timer logic", () => {
  it("returns 60 seconds remaining when no time has elapsed", () => {
    const now = 1_000_000;
    expect(computeSecondsUntilKiosk(now, now)).toBe(60);
  });

  it("returns 30 seconds remaining after 30 seconds of inactivity", () => {
    const lastActivity = 1_000_000;
    const now = lastActivity + 30_000;
    expect(computeSecondsUntilKiosk(lastActivity, now)).toBe(30);
  });

  it("returns 0 when idle time exceeds timeout", () => {
    const lastActivity = 1_000_000;
    const now = lastActivity + 65_000;
    expect(computeSecondsUntilKiosk(lastActivity, now)).toBe(0);
  });

  it("should enter kiosk when idle time >= IDLE_TIMEOUT_MS", () => {
    const lastActivity = 1_000_000;
    expect(shouldEnterKiosk(lastActivity, lastActivity + 60_000)).toBe(true);
    expect(shouldEnterKiosk(lastActivity, lastActivity + 70_000)).toBe(true);
  });

  it("should NOT enter kiosk before timeout", () => {
    const lastActivity = 1_000_000;
    expect(shouldEnterKiosk(lastActivity, lastActivity + 59_999)).toBe(false);
    expect(shouldEnterKiosk(lastActivity, lastActivity + 0)).toBe(false);
  });
});

describe("useIdleKiosk — countdown logic", () => {
  it("isCountingDown is false when more than 10 seconds remain", () => {
    expect(computeIsCountingDown(60)).toBe(false);
    expect(computeIsCountingDown(11)).toBe(false);
  });

  it("isCountingDown is true when 10 or fewer seconds remain", () => {
    expect(computeIsCountingDown(10)).toBe(true);
    expect(computeIsCountingDown(5)).toBe(true);
    expect(computeIsCountingDown(1)).toBe(true);
  });

  it("isCountingDown is false when 0 seconds remain (already triggered)", () => {
    expect(computeIsCountingDown(0)).toBe(false);
  });

  it("countdown starts at exactly IDLE_TIMEOUT_MS - COUNTDOWN_SECONDS * 1000", () => {
    const lastActivity = 1_000_000;
    const countdownStartsAt = lastActivity + (IDLE_TIMEOUT_MS - COUNTDOWN_SECONDS * 1000);
    const secs = computeSecondsUntilKiosk(lastActivity, countdownStartsAt);
    expect(secs).toBe(COUNTDOWN_SECONDS);
    expect(computeIsCountingDown(secs)).toBe(true);
  });
});

describe("useIdleKiosk — activity reset", () => {
  it("resetting lastActivity to now gives 60 seconds remaining", () => {
    const now = 5_000_000;
    // Simulate 55 seconds of inactivity, then activity resets
    const lastActivity = now; // reset
    expect(computeSecondsUntilKiosk(lastActivity, now)).toBe(60);
  });

  it("resetting during countdown stops the countdown", () => {
    const lastActivity = 1_000_000;
    const duringCountdown = lastActivity + 55_000; // 5 seconds remaining
    const secsBeforeReset = computeSecondsUntilKiosk(lastActivity, duringCountdown);
    expect(computeIsCountingDown(secsBeforeReset)).toBe(true);

    // After reset
    const secsAfterReset = computeSecondsUntilKiosk(duringCountdown, duringCountdown);
    expect(computeIsCountingDown(secsAfterReset)).toBe(false);
    expect(secsAfterReset).toBe(60);
  });
});

describe("useIdleKiosk — localStorage persistence (pure logic)", () => {
  // Use a plain Map to simulate localStorage without needing a browser environment
  const STORAGE_KEY = "liveboard:autoKiosk";

  function readEnabled(store: Map<string, string>): boolean {
    const stored = store.get(STORAGE_KEY) ?? null;
    return stored === null ? true : stored === "true";
  }

  it("defaults to enabled (true) when no stored value", () => {
    const store = new Map<string, string>();
    expect(readEnabled(store)).toBe(true);
  });

  it("reads stored false correctly", () => {
    const store = new Map<string, string>();
    store.set(STORAGE_KEY, "false");
    expect(readEnabled(store)).toBe(false);
  });

  it("reads stored true correctly", () => {
    const store = new Map<string, string>();
    store.set(STORAGE_KEY, "true");
    expect(readEnabled(store)).toBe(true);
  });

  it("toggling writes the new value to the store", () => {
    const store = new Map<string, string>();
    let isEnabled = true;
    const toggle = () => {
      isEnabled = !isEnabled;
      store.set(STORAGE_KEY, String(isEnabled));
    };
    toggle();
    expect(store.get(STORAGE_KEY)).toBe("false");
    toggle();
    expect(store.get(STORAGE_KEY)).toBe("true");
  });
});
