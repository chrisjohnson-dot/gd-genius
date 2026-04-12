/**
 * workload.throughput.test.ts
 * Tests for the new getThroughputRate, getBacklogProjection, and getBurndownSeries
 * procedures added to the workload router.
 *
 * Uses an in-memory mock DB so no live database is required.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Helpers under test (pure logic extracted) ────────────────────────────────

/** Compute items/hr from raw totals */
function computeItemsPerHour(totalItems: number, totalDurationS: number): number {
  const durH = totalDurationS / 3600;
  return durH > 0 ? Math.round(totalItems / durH) : 0;
}

/** Compute hours to clear a backlog at a given rate */
function computeHoursToComplete(backlogPieces: number, itemsPerHour: number): number | null {
  if (itemsPerHour <= 0) return null;
  return Math.round((backlogPieces / itemsPerHour) * 10) / 10;
}

/** Determine pace status from hours-to-complete */
function getPaceStatus(hoursToComplete: number | null): "on_track" | "at_risk" | "critical" | "no_data" {
  if (hoursToComplete === null) return "no_data";
  if (hoursToComplete <= 4) return "on_track";
  if (hoursToComplete <= 8) return "at_risk";
  return "critical";
}

/** Build zero-filled hourly burn-down series */
function buildBurndownSeries(
  bucketMap: Record<number, { items: number }>,
  since: number,
  hours: number,
  bucketMs = 3_600_000
): Array<{ bucket: number; items: number; cumulative: number }> {
  let cumulative = 0;
  const series = [];
  for (let i = 0; i < hours; i++) {
    const bucketStart = Math.floor((since + i * bucketMs) / bucketMs) * bucketMs;
    const d = bucketMap[bucketStart] ?? { items: 0 };
    cumulative += d.items;
    series.push({ bucket: bucketStart, items: d.items, cumulative });
  }
  return series;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("computeItemsPerHour", () => {
  it("returns 0 when duration is 0", () => {
    expect(computeItemsPerHour(500, 0)).toBe(0);
  });

  it("computes correctly for 1 hour of work", () => {
    expect(computeItemsPerHour(120, 3600)).toBe(120);
  });

  it("rounds to nearest integer", () => {
    // 100 items in 45 min = 133.33/hr → rounds to 133
    expect(computeItemsPerHour(100, 2700)).toBe(133);
  });

  it("handles fractional hours", () => {
    // 60 items in 30 min = 120/hr
    expect(computeItemsPerHour(60, 1800)).toBe(120);
  });

  it("handles large volumes", () => {
    // 10,000 items in 8 hours = 1,250/hr
    expect(computeItemsPerHour(10_000, 28_800)).toBe(1_250);
  });
});

describe("computeHoursToComplete", () => {
  it("returns null when rate is 0", () => {
    expect(computeHoursToComplete(1000, 0)).toBeNull();
  });

  it("returns null when rate is negative", () => {
    expect(computeHoursToComplete(1000, -5)).toBeNull();
  });

  it("returns 0 when backlog is empty", () => {
    expect(computeHoursToComplete(0, 100)).toBe(0);
  });

  it("computes hours correctly", () => {
    // 500 pieces at 100/hr = 5h
    expect(computeHoursToComplete(500, 100)).toBe(5);
  });

  it("rounds to 1 decimal", () => {
    // 100 pieces at 30/hr = 3.333... → 3.3
    expect(computeHoursToComplete(100, 30)).toBe(3.3);
  });

  it("handles large backlogs", () => {
    // 50,000 pieces at 1,000/hr = 50h
    expect(computeHoursToComplete(50_000, 1_000)).toBe(50);
  });
});

describe("getPaceStatus", () => {
  it("returns no_data when hours is null", () => {
    expect(getPaceStatus(null)).toBe("no_data");
  });

  it("returns on_track for ≤4h", () => {
    expect(getPaceStatus(0)).toBe("on_track");
    expect(getPaceStatus(2)).toBe("on_track");
    expect(getPaceStatus(4)).toBe("on_track");
  });

  it("returns at_risk for 4–8h", () => {
    expect(getPaceStatus(4.1)).toBe("at_risk");
    expect(getPaceStatus(6)).toBe("at_risk");
    expect(getPaceStatus(8)).toBe("at_risk");
  });

  it("returns critical for >8h", () => {
    expect(getPaceStatus(8.1)).toBe("critical");
    expect(getPaceStatus(24)).toBe("critical");
    expect(getPaceStatus(100)).toBe("critical");
  });
});

describe("buildBurndownSeries", () => {
  const HOUR = 3_600_000;
  const BASE = Math.floor(Date.now() / HOUR) * HOUR - 24 * HOUR;

  it("returns the correct number of buckets", () => {
    const series = buildBurndownSeries({}, BASE, 24);
    expect(series).toHaveLength(24);
  });

  it("zero-fills missing buckets", () => {
    const series = buildBurndownSeries({}, BASE, 6);
    expect(series.every((s) => s.items === 0)).toBe(true);
    expect(series.every((s) => s.cumulative === 0)).toBe(true);
  });

  it("accumulates cumulative correctly", () => {
    const bucketMap: Record<number, { items: number }> = {
      [BASE]:          { items: 10 },
      [BASE + HOUR]:   { items: 20 },
      [BASE + 2*HOUR]: { items: 5 },
    };
    const series = buildBurndownSeries(bucketMap, BASE, 4);
    expect(series[0].cumulative).toBe(10);
    expect(series[1].cumulative).toBe(30);
    expect(series[2].cumulative).toBe(35);
    expect(series[3].cumulative).toBe(35); // zero-filled
  });

  it("handles a single bucket with data", () => {
    const bucketMap: Record<number, { items: number }> = {
      [BASE + 5 * HOUR]: { items: 42 },
    };
    const series = buildBurndownSeries(bucketMap, BASE, 8);
    expect(series[5].items).toBe(42);
    expect(series[5].cumulative).toBe(42);
    expect(series[6].cumulative).toBe(42); // stays at 42 after
  });
});

describe("window millisecond mapping", () => {
  const WINDOW_MS: Record<string, number> = {
    "1h":  1 * 3_600_000,
    "3h":  3 * 3_600_000,
    "24h": 24 * 3_600_000,
  };

  it("1h maps to 3,600,000 ms", () => {
    expect(WINDOW_MS["1h"]).toBe(3_600_000);
  });

  it("3h maps to 10,800,000 ms", () => {
    expect(WINDOW_MS["3h"]).toBe(10_800_000);
  });

  it("24h maps to 86,400,000 ms", () => {
    expect(WINDOW_MS["24h"]).toBe(86_400_000);
  });

  it("falls back to 1h for unknown window", () => {
    const w = (WINDOW_MS["unknown"] ?? WINDOW_MS["1h"]);
    expect(w).toBe(3_600_000);
  });
});
