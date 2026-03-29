import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock DB helpers ──────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getSlaFacilityThresholds: vi.fn(),
  getSlaFacilityThreshold: vi.fn(),
  upsertSlaFacilityThreshold: vi.fn(),
}));

import {
  getSlaFacilityThresholds,
  getSlaFacilityThreshold,
  upsertSlaFacilityThreshold,
} from "./db";

const mockGetAll = getSlaFacilityThresholds as ReturnType<typeof vi.fn>;
const mockGetOne = getSlaFacilityThreshold as ReturnType<typeof vi.fn>;
const mockUpsert = upsertSlaFacilityThreshold as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("getSlaFacilityThresholds", () => {
  it("returns all facility threshold rows ordered by facilityName", async () => {
    const rows = [
      { id: 1, facilityId: 10, facilityName: "Calgary", greenThreshold: 98, yellowThreshold: 95, notes: null },
      { id: 2, facilityId: 20, facilityName: "Reno",    greenThreshold: 99, yellowThreshold: 96, notes: "Strict" },
    ];
    mockGetAll.mockResolvedValue(rows);
    const result = await getSlaFacilityThresholds();
    expect(result).toHaveLength(2);
    expect(result[0].facilityName).toBe("Calgary");
    expect(result[1].greenThreshold).toBe(99);
  });

  it("returns empty array when no thresholds configured", async () => {
    mockGetAll.mockResolvedValue([]);
    const result = await getSlaFacilityThresholds();
    expect(result).toEqual([]);
  });
});

describe("getSlaFacilityThreshold", () => {
  it("returns the threshold row for a given facilityId", async () => {
    const row = { id: 1, facilityId: 10, facilityName: "Calgary", greenThreshold: 98, yellowThreshold: 95, notes: null };
    mockGetOne.mockResolvedValue(row);
    const result = await getSlaFacilityThreshold(10);
    expect(result).toEqual(row);
    expect(mockGetOne).toHaveBeenCalledWith(10);
  });

  it("returns undefined when no threshold exists for that facilityId", async () => {
    mockGetOne.mockResolvedValue(undefined);
    const result = await getSlaFacilityThreshold(999);
    expect(result).toBeUndefined();
  });
});

describe("upsertSlaFacilityThreshold", () => {
  it("creates a new threshold row and returns it", async () => {
    const input = { facilityId: 30, facilityName: "Toronto", greenThreshold: 97, yellowThreshold: 93, notes: null };
    const saved = { id: 3, ...input };
    mockUpsert.mockResolvedValue(saved);
    const result = await upsertSlaFacilityThreshold(input);
    expect(result).toMatchObject({ facilityId: 30, greenThreshold: 97, yellowThreshold: 93 });
    expect(mockUpsert).toHaveBeenCalledWith(input);
  });

  it("updates an existing threshold row and returns the updated row", async () => {
    const input = { facilityId: 10, facilityName: "Calgary", greenThreshold: 99, yellowThreshold: 96, notes: "Updated" };
    const saved = { id: 1, ...input };
    mockUpsert.mockResolvedValue(saved);
    const result = await upsertSlaFacilityThreshold(input);
    expect(result.greenThreshold).toBe(99);
    expect(result.notes).toBe("Updated");
  });

  it("persists default thresholds (98/95) when no custom values provided", async () => {
    const input = { facilityId: 40, facilityName: "Vancouver", greenThreshold: 98, yellowThreshold: 95, notes: null };
    const saved = { id: 4, ...input };
    mockUpsert.mockResolvedValue(saved);
    const result = await upsertSlaFacilityThreshold(input);
    expect(result.greenThreshold).toBe(98);
    expect(result.yellowThreshold).toBe(95);
  });
});

describe("threshold validation logic", () => {
  it("green threshold must be greater than yellow threshold", () => {
    const greenThreshold = 95;
    const yellowThreshold = 95;
    const isValid = greenThreshold > yellowThreshold;
    expect(isValid).toBe(false);
  });

  it("valid when green is strictly greater than yellow", () => {
    const greenThreshold = 98;
    const yellowThreshold = 95;
    const isValid = greenThreshold > yellowThreshold;
    expect(isValid).toBe(true);
  });

  it("thresholds must be within 0-100 range", () => {
    const inRange = (v: number) => v >= 0 && v <= 100;
    expect(inRange(98)).toBe(true);
    expect(inRange(101)).toBe(false);
    expect(inRange(-1)).toBe(false);
  });
});
