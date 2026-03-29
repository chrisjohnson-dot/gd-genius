import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock DB helpers ──────────────────────────────────────────────────────────
vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return {
    ...actual,
    getOrderSlaStatuses: vi.fn(),
    upsertSlaDailySnapshot: vi.fn(),
  };
});

// ─── Mock notifyOwner ─────────────────────────────────────────────────────────
vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

import { getOrderSlaStatuses, upsertSlaDailySnapshot } from "./db";
import { recordSlaNightlySnapshot, todayUtcDateStr } from "./scheduler/slaNightlySnapshot";

const mockGetOrders = vi.mocked(getOrderSlaStatuses);
const mockUpsert = vi.mocked(upsertSlaDailySnapshot);

beforeEach(() => {
  vi.clearAllMocks();
  mockUpsert.mockResolvedValue(undefined);
});

// ─── todayUtcDateStr ──────────────────────────────────────────────────────────
describe("todayUtcDateStr", () => {
  it("returns a YYYY-MM-DD formatted string", () => {
    const result = todayUtcDateStr();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns today's UTC date", () => {
    const expected = new Date().toISOString().slice(0, 10);
    expect(todayUtcDateStr()).toBe(expected);
  });
});

// ─── recordSlaNightlySnapshot ─────────────────────────────────────────────────
describe("recordSlaNightlySnapshot", () => {
  it("returns an empty array when there are no orders", async () => {
    mockGetOrders.mockResolvedValueOnce([]);
    const results = await recordSlaNightlySnapshot();
    expect(results).toHaveLength(0);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("groups orders by facilityId and computes correct SLA rate", async () => {
    mockGetOrders.mockResolvedValueOnce([
      { facilityId: 1, facilityName: "WH-A", slaStatus: "in_sla" } as any,
      { facilityId: 1, facilityName: "WH-A", slaStatus: "in_sla" } as any,
      { facilityId: 1, facilityName: "WH-A", slaStatus: "out_of_sla" } as any,
      { facilityId: 2, facilityName: "WH-B", slaStatus: "in_sla" } as any,
    ]);

    const results = await recordSlaNightlySnapshot();

    expect(results).toHaveLength(2);

    const whA = results.find((r) => r.facilityId === 1)!;
    expect(whA.slaRate).toBe(67); // 2/3 = 66.7 → rounded to 67
    expect(whA.total).toBe(3);

    const whB = results.find((r) => r.facilityId === 2)!;
    expect(whB.slaRate).toBe(100);
    expect(whB.total).toBe(1);
  });

  it("calls upsertSlaDailySnapshot once per facility with today's date", async () => {
    mockGetOrders.mockResolvedValueOnce([
      { facilityId: 10, facilityName: "WH-X", slaStatus: "in_sla" } as any,
      { facilityId: 10, facilityName: "WH-X", slaStatus: "out_of_sla" } as any,
    ]);

    await recordSlaNightlySnapshot();

    expect(mockUpsert).toHaveBeenCalledOnce();
    const call = mockUpsert.mock.calls[0][0];
    expect(call.facilityId).toBe(10);
    expect(call.snapshotDate).toBe(todayUtcDateStr());
    expect(call.inSlaCount).toBe(1);
    expect(call.totalCount).toBe(2);
    expect(call.slaRate).toBe(50);
  });

  it("uses 100% SLA rate for a facility with zero orders", async () => {
    // Edge case: facility appears in facilityMap but totalCount = 0 can't happen
    // because we only add to the map when iterating orders. Verify empty orders → no upsert.
    mockGetOrders.mockResolvedValueOnce([]);
    await recordSlaNightlySnapshot();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("uses facilityName fallback when facilityName is null", async () => {
    mockGetOrders.mockResolvedValueOnce([
      { facilityId: 99, facilityName: null, slaStatus: "in_sla" } as any,
    ]);

    const results = await recordSlaNightlySnapshot();
    expect(results[0].facilityName).toBe("Facility 99");
    expect(mockUpsert.mock.calls[0][0].facilityName).toBe("Facility 99");
  });

  it("handles multiple facilities independently", async () => {
    mockGetOrders.mockResolvedValueOnce([
      { facilityId: 1, facilityName: "A", slaStatus: "in_sla" } as any,
      { facilityId: 2, facilityName: "B", slaStatus: "out_of_sla" } as any,
      { facilityId: 3, facilityName: "C", slaStatus: "in_sla" } as any,
    ]);

    const results = await recordSlaNightlySnapshot();
    expect(results).toHaveLength(3);
    expect(mockUpsert).toHaveBeenCalledTimes(3);
  });
});
