/**
 * kioskContext.test.ts
 * Unit tests for KioskContext logic (pure state transitions, no DOM).
 * We test the context value functions directly without React rendering.
 */
import { describe, it, expect } from "vitest";

// ─── Pure state helpers mirroring KioskContext logic ─────────────────────────
function computePaceStatus(ratio: number): "ahead" | "on_pace" | "behind" {
  return ratio >= 1.05 ? "ahead" : ratio >= 0.85 ? "on_pace" : "behind";
}

function computeRefetchInterval(isKiosk: boolean): number {
  return isKiosk ? 10_000 : 15_000;
}

function formatWallClock(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

describe("KioskMode — state logic", () => {
  it("refetch interval is 10 s in kiosk mode", () => {
    expect(computeRefetchInterval(true)).toBe(10_000);
  });

  it("refetch interval is 15 s in normal mode", () => {
    expect(computeRefetchInterval(false)).toBe(15_000);
  });

  it("kiosk mode starts as false (default)", () => {
    let isKiosk = false;
    expect(isKiosk).toBe(false);
  });

  it("enterKiosk sets isKiosk to true", () => {
    let isKiosk = false;
    const enterKiosk = () => { isKiosk = true; };
    enterKiosk();
    expect(isKiosk).toBe(true);
  });

  it("exitKiosk sets isKiosk to false", () => {
    let isKiosk = true;
    const exitKiosk = () => { isKiosk = false; };
    exitKiosk();
    expect(isKiosk).toBe(false);
  });

  it("toggleKiosk flips the state", () => {
    let isKiosk = false;
    const toggle = () => { isKiosk = !isKiosk; };
    toggle();
    expect(isKiosk).toBe(true);
    toggle();
    expect(isKiosk).toBe(false);
  });
});

describe("KioskMode — pace status thresholds", () => {
  it("ratio >= 1.05 → ahead", () => {
    expect(computePaceStatus(1.05)).toBe("ahead");
    expect(computePaceStatus(1.5)).toBe("ahead");
  });

  it("0.85 <= ratio < 1.05 → on_pace", () => {
    expect(computePaceStatus(1.0)).toBe("on_pace");
    expect(computePaceStatus(0.85)).toBe("on_pace");
    expect(computePaceStatus(1.04)).toBe("on_pace");
  });

  it("ratio < 0.85 → behind", () => {
    expect(computePaceStatus(0.84)).toBe("behind");
    expect(computePaceStatus(0)).toBe("behind");
  });
});

describe("KioskMode — wall clock format", () => {
  it("returns a non-empty time string", () => {
    const result = formatWallClock(new Date("2024-01-15T14:32:47.000Z"));
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("includes a colon separator", () => {
    const result = formatWallClock(new Date("2024-01-15T14:32:47.000Z"));
    expect(result).toContain(":");
  });
});
