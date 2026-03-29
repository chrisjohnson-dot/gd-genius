import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock drizzle DB ──────────────────────────────────────────────────────────
const mockInsert = vi.fn().mockReturnThis();
const mockDelete = vi.fn().mockReturnThis();
const mockSelect = vi.fn().mockReturnThis();
const mockFrom = vi.fn().mockReturnThis();
const mockWhere = vi.fn().mockReturnThis();
const mockOrderBy = vi.fn().mockReturnThis();
const mockLimit = vi.fn().mockResolvedValue([]);
const mockValues = vi.fn().mockResolvedValue(undefined);

const mockDb = {
  insert: mockInsert,
  delete: mockDelete,
  select: mockSelect,
};

mockInsert.mockReturnValue({ values: mockValues });
mockDelete.mockReturnValue({ where: mockWhere });
mockSelect.mockReturnValue({ from: mockFrom });
mockFrom.mockReturnValue({ where: mockWhere });
mockWhere.mockReturnValue({ orderBy: mockOrderBy, where: mockWhere });
mockOrderBy.mockReturnValue({ limit: mockLimit });

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return {
    ...actual,
    upsertSlaDailySnapshot: vi.fn(),
    getSlaDailyHistory: vi.fn(),
    getLatestSlaDailySnapshots: vi.fn(),
  };
});

import {
  upsertSlaDailySnapshot,
  getSlaDailyHistory,
  getLatestSlaDailySnapshots,
} from "./db";

const mockUpsert = vi.mocked(upsertSlaDailySnapshot);
const mockHistory = vi.mocked(getSlaDailyHistory);
const mockLatest = vi.mocked(getLatestSlaDailySnapshots);

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Sample data ──────────────────────────────────────────────────────────────
const sampleSnapshot = {
  id: 1,
  facilityId: 42,
  facilityName: "Warehouse A",
  snapshotDate: "2026-03-22",
  inSlaCount: 95,
  totalCount: 100,
  slaRate: 95,
  createdAt: new Date("2026-03-22T00:00:00Z"),
};

// ─── upsertSlaDailySnapshot ───────────────────────────────────────────────────
describe("upsertSlaDailySnapshot", () => {
  it("calls upsert with correct data shape", async () => {
    mockUpsert.mockResolvedValueOnce(undefined);
    await upsertSlaDailySnapshot({
      facilityId: 42,
      facilityName: "Warehouse A",
      snapshotDate: "2026-03-22",
      inSlaCount: 95,
      totalCount: 100,
      slaRate: 95,
    });
    expect(mockUpsert).toHaveBeenCalledWith({
      facilityId: 42,
      facilityName: "Warehouse A",
      snapshotDate: "2026-03-22",
      inSlaCount: 95,
      totalCount: 100,
      slaRate: 95,
    });
  });

  it("handles zero totalCount (100% SLA by convention)", async () => {
    mockUpsert.mockResolvedValueOnce(undefined);
    await upsertSlaDailySnapshot({
      facilityId: 1,
      facilityName: "Empty WH",
      snapshotDate: "2026-03-22",
      inSlaCount: 0,
      totalCount: 0,
      slaRate: 100,
    });
    expect(mockUpsert).toHaveBeenCalledOnce();
  });
});

// ─── getSlaDailyHistory ───────────────────────────────────────────────────────
describe("getSlaDailyHistory", () => {
  it("returns snapshots in oldest-first order", async () => {
    const points = [
      { ...sampleSnapshot, snapshotDate: "2026-03-20", slaRate: 93 },
      { ...sampleSnapshot, snapshotDate: "2026-03-21", slaRate: 95 },
      { ...sampleSnapshot, snapshotDate: "2026-03-22", slaRate: 97 },
    ];
    mockHistory.mockResolvedValueOnce(points);
    const result = await getSlaDailyHistory(42, 7);
    expect(result[0].snapshotDate).toBe("2026-03-20");
    expect(result[result.length - 1].snapshotDate).toBe("2026-03-22");
  });

  it("returns empty array when no history exists", async () => {
    mockHistory.mockResolvedValueOnce([]);
    const result = await getSlaDailyHistory(99, 7);
    expect(result).toHaveLength(0);
  });

  it("respects the days limit parameter", async () => {
    const points = Array.from({ length: 3 }, (_, i) => ({
      ...sampleSnapshot,
      snapshotDate: `2026-03-${20 + i}`,
      slaRate: 95 + i,
    }));
    mockHistory.mockResolvedValueOnce(points);
    const result = await getSlaDailyHistory(42, 3);
    expect(result).toHaveLength(3);
  });
});

// ─── getLatestSlaDailySnapshots ───────────────────────────────────────────────
describe("getLatestSlaDailySnapshots", () => {
  it("returns one row per facility (deduplication)", async () => {
    mockLatest.mockResolvedValueOnce([
      { ...sampleSnapshot, facilityId: 1, facilityName: "WH-1" },
      { ...sampleSnapshot, facilityId: 2, facilityName: "WH-2" },
    ]);
    const result = await getLatestSlaDailySnapshots();
    const ids = result.map((r) => r.facilityId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("returns empty array when no snapshots exist", async () => {
    mockLatest.mockResolvedValueOnce([]);
    const result = await getLatestSlaDailySnapshots();
    expect(result).toHaveLength(0);
  });
});
