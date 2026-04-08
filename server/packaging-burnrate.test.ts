/**
 * Unit tests for the packaging inventory burn rate / days-remaining logic.
 * These mirror the pure functions in PackagingInventory.tsx so they can be
 * tested server-side without a DOM.
 */
import { describe, it, expect } from "vitest";

// ─── Pure helpers (duplicated from the page for testability) ─────────────────

function daysRemaining(onHandQty: number, weeklyConsumption: number): number | null {
  if (!weeklyConsumption || weeklyConsumption === 0) return null;
  return Math.round((onHandQty / weeklyConsumption) * 7);
}

function burnUrgency(days: number | null): "unknown" | "critical" | "warning" | "ok" {
  if (days === null) return "unknown";
  if (days < 7) return "critical";
  if (days < 14) return "warning";
  return "ok";
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("daysRemaining", () => {
  it("returns null when weeklyConsumption is 0", () => {
    expect(daysRemaining(100, 0)).toBeNull();
  });

  it("returns null when weeklyConsumption is not set (falsy)", () => {
    expect(daysRemaining(50, 0)).toBeNull();
  });

  it("calculates correctly for exact weeks", () => {
    // 70 on hand, 10/week → 7 days
    expect(daysRemaining(70, 70)).toBe(7);
  });

  it("calculates correctly for fractional weeks", () => {
    // 150 on hand, 50/week → 21 days
    expect(daysRemaining(150, 50)).toBe(21);
  });

  it("rounds to nearest day", () => {
    // 100 on hand, 30/week → 100/30 * 7 = 23.33 → 23
    expect(daysRemaining(100, 30)).toBe(23);
  });

  it("returns 0 when on-hand is 0", () => {
    expect(daysRemaining(0, 50)).toBe(0);
  });

  it("handles high consumption rate", () => {
    // 5 on hand, 100/week → 0.35 days → rounds to 0
    expect(daysRemaining(5, 100)).toBe(0);
  });
});

describe("burnUrgency", () => {
  it("returns unknown for null days", () => {
    expect(burnUrgency(null)).toBe("unknown");
  });

  it("returns critical for 0 days", () => {
    expect(burnUrgency(0)).toBe("critical");
  });

  it("returns critical for 6 days", () => {
    expect(burnUrgency(6)).toBe("critical");
  });

  it("returns critical for exactly 0 days (out of stock)", () => {
    expect(burnUrgency(0)).toBe("critical");
  });

  it("returns warning for exactly 7 days", () => {
    expect(burnUrgency(7)).toBe("warning");
  });

  it("returns warning for 13 days", () => {
    expect(burnUrgency(13)).toBe("warning");
  });

  it("returns ok for exactly 14 days", () => {
    expect(burnUrgency(14)).toBe("ok");
  });

  it("returns ok for 30 days", () => {
    expect(burnUrgency(30)).toBe("ok");
  });
});

describe("combined burn rate scenarios", () => {
  it("flags a box with 3 days of stock as critical", () => {
    const days = daysRemaining(15, 35); // 15/35 * 7 = 3
    expect(days).toBe(3);
    expect(burnUrgency(days)).toBe("critical");
  });

  it("flags a box with 10 days as warning", () => {
    const days = daysRemaining(50, 35); // 50/35 * 7 = 10
    expect(days).toBe(10);
    expect(burnUrgency(days)).toBe("warning");
  });

  it("marks a well-stocked item as ok", () => {
    const days = daysRemaining(200, 50); // 200/50 * 7 = 28
    expect(days).toBe(28);
    expect(burnUrgency(days)).toBe("ok");
  });

  it("treats unknown consumption as unknown urgency", () => {
    const days = daysRemaining(500, 0);
    expect(days).toBeNull();
    expect(burnUrgency(days)).toBe("unknown");
  });
});
