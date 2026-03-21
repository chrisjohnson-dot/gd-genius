/**
 * Tests for the overdue order morning alert scheduler.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock db module ───────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getOverdueUnallocatedOrders: vi.fn(),
}));

// ─── Mock notification module ─────────────────────────────────────────────────
vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn(),
}));

import { getOverdueUnallocatedOrders } from "./db";
import { notifyOwner } from "./_core/notification";
import { sendOverdueAlertNow } from "./scheduler/overdueAlert";

// Typed mock helpers
const mockGetOverdue = getOverdueUnallocatedOrders as ReturnType<typeof vi.fn>;
const mockNotify = notifyOwner as ReturnType<typeof vi.fn>;

// Minimal OrderTracking-like fixture
function makeOrder(overrides: Partial<{
  extensivOrderId: number;
  referenceNum: string;
  clientName: string;
  facilityId: number;
  facilityName: string;
  shipToName: string;
  shipToCity: string;
  requiredShipDate: string;
}> = {}) {
  return {
    id: 1,
    extensivOrderId: overrides.extensivOrderId ?? 1001,
    referenceNum: overrides.referenceNum ?? "REF-001",
    poNum: null,
    configId: 1,
    clientId: 10,
    clientName: overrides.clientName ?? "Acme Corp",
    facilityId: overrides.facilityId ?? 1,
    facilityName: overrides.facilityName ?? "TOR-Toronto",
    shipToName: overrides.shipToName ?? "Destination Inc",
    shipToCity: overrides.shipToCity ?? "Ottawa",
    totalPieces: 50,
    skuCount: 3,
    notes: null,
    extensivStatus: 0,
    creationDate: "2026-01-01",
    requiredShipDate: overrides.requiredShipDate ?? "2026-01-15",
    lifecycleStatus: "unallocated" as const,
    assignedAssociate: null,
    shipwellOrderId: null,
    shipwellShipmentId: null,
    shipwellPoUrl: null,
    shipwellShipmentUrl: null,
    shipwellStatus: null,
    shipwellBidCount: null,
    shipwellQuotingStartedAt: null,
    shipwellZeroBidNotifiedAt: null,
    firstSeenAt: new Date("2026-01-01"),
    lastSyncedAt: new Date("2026-01-01"),
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
  };
}

describe("sendOverdueAlertNow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns success with zero count and does NOT notify when there are no overdue orders", async () => {
    mockGetOverdue.mockResolvedValueOnce([]);

    const result = await sendOverdueAlertNow();

    expect(result.success).toBe(true);
    expect(result.overdueCount).toBe(0);
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("sends a notification when there are overdue orders", async () => {
    const orders = [makeOrder({ referenceNum: "REF-100", requiredShipDate: "2026-01-10" })];
    mockGetOverdue.mockResolvedValueOnce(orders);
    mockNotify.mockResolvedValueOnce(true);

    const result = await sendOverdueAlertNow();

    expect(result.success).toBe(true);
    expect(result.overdueCount).toBe(1);
    expect(mockNotify).toHaveBeenCalledOnce();

    const [payload] = mockNotify.mock.calls[0];
    expect(payload.title).toContain("Overdue");
    expect(payload.content).toContain("REF-100");
    expect(payload.content).toContain("TOR-Toronto");
  });

  it("includes all overdue orders in the notification body", async () => {
    const orders = [
      makeOrder({ referenceNum: "REF-A", facilityName: "TOR-Toronto", requiredShipDate: "2026-01-05" }),
      makeOrder({ extensivOrderId: 1002, referenceNum: "REF-B", facilityName: "TOR-Toronto", requiredShipDate: "2026-01-08" }),
      makeOrder({ extensivOrderId: 1003, referenceNum: "REF-C", facilityName: "CAL-Calgary", requiredShipDate: "2026-01-09" }),
    ];
    mockGetOverdue.mockResolvedValueOnce(orders);
    mockNotify.mockResolvedValueOnce(true);

    const result = await sendOverdueAlertNow();

    expect(result.overdueCount).toBe(3);
    const content: string = mockNotify.mock.calls[0][0].content;
    expect(content).toContain("REF-A");
    expect(content).toContain("REF-B");
    expect(content).toContain("REF-C");
    expect(content).toContain("TOR-Toronto");
    expect(content).toContain("CAL-Calgary");
  });

  it("groups orders by facility in the notification", async () => {
    const orders = [
      makeOrder({ referenceNum: "REF-T1", facilityName: "TOR-Toronto" }),
      makeOrder({ extensivOrderId: 1002, referenceNum: "REF-T2", facilityName: "TOR-Toronto" }),
      makeOrder({ extensivOrderId: 1003, referenceNum: "REF-C1", facilityName: "CAL-Calgary" }),
    ];
    mockGetOverdue.mockResolvedValueOnce(orders);
    mockNotify.mockResolvedValueOnce(true);

    await sendOverdueAlertNow();

    const content: string = mockNotify.mock.calls[0][0].content;
    // TOR-Toronto section should appear before CAL-Calgary (alphabetical via Map insertion)
    const torIdx = content.indexOf("TOR-Toronto");
    const calIdx = content.indexOf("CAL-Calgary");
    expect(torIdx).toBeGreaterThanOrEqual(0);
    expect(calIdx).toBeGreaterThanOrEqual(0);
  });

  it("returns success=false when the notification service returns false", async () => {
    mockGetOverdue.mockResolvedValueOnce([makeOrder()]);
    mockNotify.mockResolvedValueOnce(false);

    const result = await sendOverdueAlertNow();

    expect(result.success).toBe(false);
    expect(result.overdueCount).toBe(1);
  });

  it("returns success=false when the DB query throws", async () => {
    mockGetOverdue.mockRejectedValueOnce(new Error("DB connection lost"));

    const result = await sendOverdueAlertNow();

    expect(result.success).toBe(false);
    expect(result.overdueCount).toBe(0);
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("notification title includes the overdue order count", async () => {
    const orders = [makeOrder(), makeOrder({ extensivOrderId: 9999, referenceNum: "REF-999" })];
    mockGetOverdue.mockResolvedValueOnce(orders);
    mockNotify.mockResolvedValueOnce(true);

    await sendOverdueAlertNow();

    const title: string = mockNotify.mock.calls[0][0].title;
    expect(title).toContain("2");
  });
});
