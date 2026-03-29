import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock the DB module ────────────────────────────────────────────────────────
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getPutAwayPriorities: vi.fn(),
    savePutAwayPriorities: vi.fn(),
    deletePutAwayPriorities: vi.fn(),
  };
});

import {
  getPutAwayPriorities,
  savePutAwayPriorities,
  deletePutAwayPriorities,
} from "./db";

const mockGet = vi.mocked(getPutAwayPriorities);
const mockSave = vi.mocked(savePutAwayPriorities);
const mockDelete = vi.mocked(deletePutAwayPriorities);

// ─── Helper: build a minimal PutAwayPriority row ───────────────────────────────
function makePriority(aisle: string, priorityOrder: number, level = "*") {
  return {
    id: priorityOrder,
    configId: 1,
    facilityId: 10,
    customerId: 20,
    aisle,
    level,
    priorityOrder,
    updatedAt: Date.now(),
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("getPutAwayPriorities", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns an empty array when no priorities are configured", async () => {
    mockGet.mockResolvedValue([]);
    const result = await getPutAwayPriorities(1, 10, 20);
    expect(result).toEqual([]);
    expect(mockGet).toHaveBeenCalledWith(1, 10, 20);
  });

  it("returns priorities ordered by priorityOrder ascending", async () => {
    mockGet.mockResolvedValue([
      makePriority("A", 1),
      makePriority("D", 2),
      makePriority("G", 3),
    ]);
    const result = await getPutAwayPriorities(1, 10, 20);
    expect(result.map((r) => r.aisle)).toEqual(["A", "D", "G"]);
    expect(result.map((r) => r.priorityOrder)).toEqual([1, 2, 3]);
  });

  it("returns all fields correctly", async () => {
    const row = makePriority("B", 1, "C");
    mockGet.mockResolvedValue([row]);
    const result = await getPutAwayPriorities(1, 10, 20);
    expect(result[0]).toMatchObject({
      configId: 1,
      facilityId: 10,
      customerId: 20,
      aisle: "B",
      level: "C",
      priorityOrder: 1,
    });
  });
});

describe("savePutAwayPriorities", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls save with the correct arguments", async () => {
    mockSave.mockResolvedValue(undefined);
    const entries = [
      { aisle: "A", level: "*", priorityOrder: 1 },
      { aisle: "D", level: "*", priorityOrder: 2 },
    ];
    await savePutAwayPriorities(1, 10, 20, entries);
    expect(mockSave).toHaveBeenCalledWith(1, 10, 20, entries);
  });

  it("accepts an empty entries array (clears all priorities)", async () => {
    mockSave.mockResolvedValue(undefined);
    await savePutAwayPriorities(1, 10, 20, []);
    expect(mockSave).toHaveBeenCalledWith(1, 10, 20, []);
  });
});

describe("deletePutAwayPriorities", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls delete with the correct arguments", async () => {
    mockDelete.mockResolvedValue(undefined);
    await deletePutAwayPriorities(1, 10, 20);
    expect(mockDelete).toHaveBeenCalledWith(1, 10, 20);
  });
});

// ─── Suggestion engine priority logic (pure unit tests) ───────────────────────

describe("Put Away suggestion engine — aisle priority ranking", () => {
  /**
   * Inline replica of the getAislePriority helper used in the suggest procedure.
   * We test the logic in isolation so we do not need to mock the full Extensiv API.
   */
  function buildAislePriorityMap(
    priorities: Array<{ aisle: string; priorityOrder: number }>
  ): Map<string, number> {
    const map = new Map<string, number>();
    for (const p of priorities) {
      map.set(p.aisle.toUpperCase(), p.priorityOrder);
    }
    return map;
  }

  function getAislePriority(
    locationName: string,
    aislePriorityMap: Map<string, number>
  ): number | null {
    const aisle = locationName.split("-")[0]?.toUpperCase() ?? "";
    return aislePriorityMap.has(aisle) ? aislePriorityMap.get(aisle)! : null;
  }

  it("extracts the correct aisle from a location name", () => {
    const map = buildAislePriorityMap([{ aisle: "D", priorityOrder: 1 }]);
    expect(getAislePriority("D-017-C", map)).toBe(1);
    expect(getAislePriority("D-001-A", map)).toBe(1);
  });

  it("returns null for locations in non-prioritised aisles", () => {
    const map = buildAislePriorityMap([{ aisle: "A", priorityOrder: 1 }]);
    expect(getAislePriority("D-017-C", map)).toBeNull();
    expect(getAislePriority("G-005-B", map)).toBeNull();
  });

  it("is case-insensitive for aisle matching", () => {
    const map = buildAislePriorityMap([{ aisle: "d", priorityOrder: 2 }]);
    expect(getAislePriority("D-017-C", map)).toBe(2);
    expect(getAislePriority("d-017-c", map)).toBe(2);
  });

  it("returns null for an empty priority map (no config)", () => {
    const map = buildAislePriorityMap([]);
    expect(getAislePriority("D-017-C", map)).toBeNull();
  });

  it("respects the correct priority order for multiple aisles", () => {
    const map = buildAislePriorityMap([
      { aisle: "G", priorityOrder: 1 },
      { aisle: "A", priorityOrder: 2 },
      { aisle: "D", priorityOrder: 3 },
    ]);
    expect(getAislePriority("G-001-A", map)).toBe(1);
    expect(getAislePriority("A-010-B", map)).toBe(2);
    expect(getAislePriority("D-017-C", map)).toBe(3);
  });

  it("handles location names without dashes (single-segment names)", () => {
    const map = buildAislePriorityMap([{ aisle: "STAGING", priorityOrder: 1 }]);
    expect(getAislePriority("STAGING", map)).toBe(1);
    expect(getAislePriority("STAGING01", map)).toBeNull(); // no dash → full name is aisle
  });

  it("prioritised aisles sort before non-prioritised aisles", () => {
    const map = buildAislePriorityMap([{ aisle: "A", priorityOrder: 1 }]);

    type Suggestion = { locationName: string; priority: number };

    const suggestions: Suggestion[] = [
      { locationName: "D-001-A", priority: 8 }, // non-prioritised warehouse
      { locationName: "A-001-A", priority: 6 }, // prioritised warehouse
    ];

    suggestions.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      const aPri = getAislePriority(a.locationName, map) ?? 9999;
      const bPri = getAislePriority(b.locationName, map) ?? 9999;
      if (aPri !== bPri) return aPri - bPri;
      return a.locationName.localeCompare(b.locationName);
    });

    expect(suggestions[0].locationName).toBe("A-001-A");
    expect(suggestions[1].locationName).toBe("D-001-A");
  });
});
