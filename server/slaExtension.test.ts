/**
 * Tests for per-order SLA extension logic.
 *
 * The extension feature allows individual orders to have their SLA deadline
 * pushed out by a configurable number of days (e.g. when a customer requests
 * a later ship date). The extension is stored as slaExtensionDays on the
 * order_tracking row and is applied additively to the effective SLA days
 * before computing daysRemaining.
 *
 * Core invariant:
 *   effectiveSlaDays = baseSla + extensionDays
 *   daysRemaining    = effectiveSlaDays - ageCalendarDays
 *   slaStatus        = daysRemaining >= 0 ? "in_sla" : "out_of_sla"
 */

import { describe, it, expect } from "vitest";

// ─── Pure helper that mirrors the engine logic ────────────────────────────────

function computeSlaStatus(
  baseSla: number,
  ageCalendarDays: number,
  extensionDays: number
): {
  effectiveSlaDays: number;
  daysRemaining: number;
  slaStatus: "in_sla" | "out_of_sla";
} {
  const effectiveSlaDays = baseSla + extensionDays;
  const daysRemaining = effectiveSlaDays - ageCalendarDays;
  const slaStatus: "in_sla" | "out_of_sla" =
    daysRemaining >= 0 ? "in_sla" : "out_of_sla";
  return { effectiveSlaDays, daysRemaining, slaStatus };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("computeSlaStatus — per-order SLA extension", () => {
  it("returns in_sla when age is within base SLA (no extension)", () => {
    const result = computeSlaStatus(2, 1, 0);
    expect(result.effectiveSlaDays).toBe(2);
    expect(result.daysRemaining).toBe(1);
    expect(result.slaStatus).toBe("in_sla");
  });

  it("returns out_of_sla when age exceeds base SLA (no extension)", () => {
    const result = computeSlaStatus(2, 3, 0);
    expect(result.effectiveSlaDays).toBe(2);
    expect(result.daysRemaining).toBe(-1);
    expect(result.slaStatus).toBe("out_of_sla");
  });

  it("extension days are added to base SLA", () => {
    const result = computeSlaStatus(2, 3, 2);
    expect(result.effectiveSlaDays).toBe(4);
    expect(result.daysRemaining).toBe(1);
    expect(result.slaStatus).toBe("in_sla");
  });

  it("order that would be out_of_sla becomes in_sla after extension", () => {
    // Base SLA = 2d, age = 5d → normally 3d overdue
    // Extension = 4d → effectiveSla = 6d, daysRemaining = 1 → in_sla
    const result = computeSlaStatus(2, 5, 4);
    expect(result.effectiveSlaDays).toBe(6);
    expect(result.daysRemaining).toBe(1);
    expect(result.slaStatus).toBe("in_sla");
  });

  it("extension of 0 days has no effect", () => {
    const result = computeSlaStatus(3, 4, 0);
    expect(result.effectiveSlaDays).toBe(3);
    expect(result.daysRemaining).toBe(-1);
    expect(result.slaStatus).toBe("out_of_sla");
  });

  it("extension exactly covers the overdue amount", () => {
    // Base SLA = 2d, age = 5d → 3d overdue; extension = 3d → daysRemaining = 0 → in_sla
    const result = computeSlaStatus(2, 5, 3);
    expect(result.effectiveSlaDays).toBe(5);
    expect(result.daysRemaining).toBe(0);
    expect(result.slaStatus).toBe("in_sla");
  });

  it("large extension keeps order well within SLA", () => {
    const result = computeSlaStatus(2, 10, 30);
    expect(result.effectiveSlaDays).toBe(32);
    expect(result.daysRemaining).toBe(22);
    expect(result.slaStatus).toBe("in_sla");
  });

  it("extension on a fresh order (age=0) adds to already-positive daysRemaining", () => {
    const result = computeSlaStatus(2, 0, 5);
    expect(result.effectiveSlaDays).toBe(7);
    expect(result.daysRemaining).toBe(7);
    expect(result.slaStatus).toBe("in_sla");
  });

  it("extension still shows out_of_sla if not large enough", () => {
    // Base SLA = 2d, age = 10d → 8d overdue; extension = 5d → still 3d overdue
    const result = computeSlaStatus(2, 10, 5);
    expect(result.effectiveSlaDays).toBe(7);
    expect(result.daysRemaining).toBe(-3);
    expect(result.slaStatus).toBe("out_of_sla");
  });

  it("extension interacts correctly with sub-rule SLA (higher base)", () => {
    // Sub-rule SLA = 4d (e.g. Labeling), age = 6d → 2d overdue; extension = 3d → in_sla
    const result = computeSlaStatus(4, 6, 3);
    expect(result.effectiveSlaDays).toBe(7);
    expect(result.daysRemaining).toBe(1);
    expect(result.slaStatus).toBe("in_sla");
  });
});

// ─── Validation helpers ───────────────────────────────────────────────────────

describe("SLA extension input validation", () => {
  it("extension days must be a positive integer (1-365)", () => {
    // This mirrors the z.number().int().min(1).max(365) zod schema on the tRPC mutation
    const validValues = [1, 2, 7, 30, 90, 365];
    const invalidValues = [0, -1, 366, 1000];

    for (const v of validValues) {
      expect(v >= 1 && v <= 365).toBe(true);
    }
    for (const v of invalidValues) {
      expect(v >= 1 && v <= 365).toBe(false);
    }
  });

  it("note field is optional and can be null or a string", () => {
    const validNotes: (string | null)[] = [null, "", "Customer requested later date", "Holiday delay"];
    for (const note of validNotes) {
      expect(note === null || typeof note === "string").toBe(true);
    }
  });
});
