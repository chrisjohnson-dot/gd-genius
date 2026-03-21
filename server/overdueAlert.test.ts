/**
 * Tests for the overdue order morning alert scheduler.
 * Covers: basic behaviour, suppression, escalation, error paths, and content.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock db module ───────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getOverdueUnallocatedOrders: vi.fn(),
  markOverdueAlertSent: vi.fn().mockResolvedValue(undefined),
  getAlertTime: vi.fn().mockResolvedValue({ hour: 7, minute: 0 }),
}));

// ─── Mock notification module ─────────────────────────────────────────────────
vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn(),
}));

import { getOverdueUnallocatedOrders, markOverdueAlertSent } from "./db";
import { notifyOwner } from "./_core/notification";
import {
  sendOverdueAlertNow,
  alreadyNotifiedToday,
  isEscalated,
  daysSinceLastAlert,
  ESCALATION_THRESHOLD_DAYS,
} from "./scheduler/overdueAlert";

// Typed mock helpers
const mockGetOverdue = getOverdueUnallocatedOrders as ReturnType<typeof vi.fn>;
const mockMarkSent = markOverdueAlertSent as ReturnType<typeof vi.fn>;
const mockNotify = notifyOwner as ReturnType<typeof vi.fn>;

/** Returns a Date N calendar days ago. */
function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

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
  lastOverdueAlertSentAt: Date | null;
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
    lastOverdueAlertSentAt: overrides.lastOverdueAlertSentAt !== undefined
      ? overrides.lastOverdueAlertSentAt
      : null,
    firstSeenAt: new Date("2026-01-01"),
    lastSyncedAt: new Date("2026-01-01"),
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
  };
}

// ─── Unit tests for helper functions ─────────────────────────────────────────

describe("alreadyNotifiedToday", () => {
  it("returns false for null", () => {
    expect(alreadyNotifiedToday(null)).toBe(false);
  });
  it("returns true when lastSentAt is today", () => {
    expect(alreadyNotifiedToday(new Date())).toBe(true);
  });
  it("returns false when lastSentAt is yesterday", () => {
    expect(alreadyNotifiedToday(daysAgo(1))).toBe(false);
  });
});

describe("daysSinceLastAlert", () => {
  it("returns null for null input", () => {
    expect(daysSinceLastAlert(null)).toBeNull();
  });
  it("returns 0 for today", () => {
    expect(daysSinceLastAlert(new Date())).toBe(0);
  });
  it("returns 1 for yesterday", () => {
    expect(daysSinceLastAlert(daysAgo(1))).toBe(1);
  });
  it(`returns ${ESCALATION_THRESHOLD_DAYS} for ${ESCALATION_THRESHOLD_DAYS} days ago`, () => {
    expect(daysSinceLastAlert(daysAgo(ESCALATION_THRESHOLD_DAYS))).toBe(ESCALATION_THRESHOLD_DAYS);
  });
});

describe("isEscalated", () => {
  it("returns false for null (never notified)", () => {
    expect(isEscalated(null)).toBe(false);
  });
  it("returns false when notified today", () => {
    expect(isEscalated(new Date())).toBe(false);
  });
  it("returns false when notified 1 day ago (below threshold)", () => {
    expect(isEscalated(daysAgo(1))).toBe(false);
  });
  it(`returns true when notified exactly ${ESCALATION_THRESHOLD_DAYS} days ago`, () => {
    expect(isEscalated(daysAgo(ESCALATION_THRESHOLD_DAYS))).toBe(true);
  });
  it("returns true when notified 5 days ago", () => {
    expect(isEscalated(daysAgo(5))).toBe(true);
  });
});

// ─── Integration tests for sendOverdueAlertNow ───────────────────────────────

describe("sendOverdueAlertNow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMarkSent.mockResolvedValue(undefined);
  });

  // ── Basic behaviour ────────────────────────────────────────────────────────

  it("returns success with zero count and does NOT notify when there are no overdue orders", async () => {
    mockGetOverdue.mockResolvedValueOnce([]);

    const result = await sendOverdueAlertNow();

    expect(result.success).toBe(true);
    expect(result.overdueCount).toBe(0);
    expect(result.suppressedCount).toBe(0);
    expect(result.escalatedCount).toBe(0);
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("sends a notification when there are overdue orders", async () => {
    const orders = [makeOrder({ referenceNum: "REF-100", requiredShipDate: "2026-01-10" })];
    mockGetOverdue.mockResolvedValueOnce(orders);
    mockNotify.mockResolvedValueOnce(true);

    const result = await sendOverdueAlertNow();

    expect(result.success).toBe(true);
    expect(result.overdueCount).toBe(1);
    expect(result.suppressedCount).toBe(0);
    expect(result.escalatedCount).toBe(0);
    expect(mockNotify).toHaveBeenCalledOnce();

    const [payload] = mockNotify.mock.calls[0];
    expect(payload.title).toContain("Overdue");
    expect(payload.content).toContain("REF-100");
    expect(payload.content).toContain("TOR-Toronto");
  });

  it("stamps markOverdueAlertSent on all notified orders after a successful notification", async () => {
    const orders = [
      makeOrder({ extensivOrderId: 1001 }),
      makeOrder({ extensivOrderId: 1002, referenceNum: "REF-002" }),
    ];
    mockGetOverdue.mockResolvedValueOnce(orders);
    mockNotify.mockResolvedValueOnce(true);

    await sendOverdueAlertNow();

    expect(mockMarkSent).toHaveBeenCalledOnce();
    const [ids] = mockMarkSent.mock.calls[0];
    expect(ids).toContain(1001);
    expect(ids).toContain(1002);
  });

  it("does NOT stamp markOverdueAlertSent when the notification service fails", async () => {
    mockGetOverdue.mockResolvedValueOnce([makeOrder()]);
    mockNotify.mockResolvedValueOnce(false);

    await sendOverdueAlertNow();

    expect(mockMarkSent).not.toHaveBeenCalled();
  });

  // ── Suppression logic ──────────────────────────────────────────────────────

  it("suppresses orders whose lastOverdueAlertSentAt is today", async () => {
    const alreadyNotified = makeOrder({
      extensivOrderId: 1001,
      referenceNum: "REF-SUPPRESSED",
      lastOverdueAlertSentAt: new Date(), // today
    });
    const fresh = makeOrder({
      extensivOrderId: 1002,
      referenceNum: "REF-FRESH",
      lastOverdueAlertSentAt: null,
    });
    mockGetOverdue.mockResolvedValueOnce([alreadyNotified, fresh]);
    mockNotify.mockResolvedValueOnce(true);

    const result = await sendOverdueAlertNow();

    expect(result.overdueCount).toBe(1);   // only REF-FRESH
    expect(result.suppressedCount).toBe(1); // REF-SUPPRESSED skipped
    const content: string = mockNotify.mock.calls[0][0].content;
    expect(content).toContain("REF-FRESH");
    expect(content).not.toContain("REF-SUPPRESSED");
  });

  it("does NOT suppress orders whose lastOverdueAlertSentAt is yesterday", async () => {
    const notifiedYesterday = makeOrder({
      extensivOrderId: 1001,
      referenceNum: "REF-YESTERDAY",
      lastOverdueAlertSentAt: daysAgo(1),
    });
    mockGetOverdue.mockResolvedValueOnce([notifiedYesterday]);
    mockNotify.mockResolvedValueOnce(true);

    const result = await sendOverdueAlertNow();

    expect(result.overdueCount).toBe(1);
    expect(result.suppressedCount).toBe(0);
    const content: string = mockNotify.mock.calls[0][0].content;
    expect(content).toContain("REF-YESTERDAY");
  });

  it("skips notification entirely when ALL overdue orders were already notified today (and none are escalated)", async () => {
    const orders = [
      makeOrder({ extensivOrderId: 1001, lastOverdueAlertSentAt: new Date() }),
      makeOrder({ extensivOrderId: 1002, lastOverdueAlertSentAt: new Date() }),
    ];
    mockGetOverdue.mockResolvedValueOnce(orders);

    const result = await sendOverdueAlertNow();

    expect(result.success).toBe(true);
    expect(result.overdueCount).toBe(0);
    expect(result.suppressedCount).toBe(2);
    expect(result.escalatedCount).toBe(0);
    expect(mockNotify).not.toHaveBeenCalled();
    expect(mockMarkSent).not.toHaveBeenCalled();
  });

  it("includes suppressed count note in notification when some orders were suppressed", async () => {
    const suppressed = makeOrder({ extensivOrderId: 1001, lastOverdueAlertSentAt: new Date() });
    const fresh = makeOrder({ extensivOrderId: 1002, referenceNum: "REF-NEW" });
    mockGetOverdue.mockResolvedValueOnce([suppressed, fresh]);
    mockNotify.mockResolvedValueOnce(true);

    await sendOverdueAlertNow();

    const content: string = mockNotify.mock.calls[0][0].content;
    expect(content).toMatch(/1 additional order.*already notified today/i);
  });

  // ── Escalation logic ───────────────────────────────────────────────────────

  it(`escalates orders notified exactly ${ESCALATION_THRESHOLD_DAYS} days ago`, async () => {
    const escalated = makeOrder({
      extensivOrderId: 2001,
      referenceNum: "REF-ESCALATED",
      lastOverdueAlertSentAt: daysAgo(ESCALATION_THRESHOLD_DAYS),
    });
    mockGetOverdue.mockResolvedValueOnce([escalated]);
    mockNotify.mockResolvedValueOnce(true);

    const result = await sendOverdueAlertNow();

    expect(result.escalatedCount).toBe(1);
    expect(result.overdueCount).toBe(1);
    expect(result.suppressedCount).toBe(0);

    const content: string = mockNotify.mock.calls[0][0].content;
    expect(content).toContain("REF-ESCALATED");
    expect(content).toContain("ESCALATED");
  });

  it("escalates orders notified 5 days ago", async () => {
    const escalated = makeOrder({
      extensivOrderId: 2002,
      referenceNum: "REF-OLD",
      lastOverdueAlertSentAt: daysAgo(5),
    });
    mockGetOverdue.mockResolvedValueOnce([escalated]);
    mockNotify.mockResolvedValueOnce(true);

    const result = await sendOverdueAlertNow();

    expect(result.escalatedCount).toBe(1);
    const content: string = mockNotify.mock.calls[0][0].content;
    expect(content).toContain("ESCALATED");
  });

  it("does NOT escalate orders notified only 1 day ago", async () => {
    const recent = makeOrder({
      extensivOrderId: 2003,
      referenceNum: "REF-RECENT",
      lastOverdueAlertSentAt: daysAgo(1),
    });
    mockGetOverdue.mockResolvedValueOnce([recent]);
    mockNotify.mockResolvedValueOnce(true);

    const result = await sendOverdueAlertNow();

    expect(result.escalatedCount).toBe(0);
    const content: string = mockNotify.mock.calls[0][0].content;
    expect(content).not.toContain("ESCALATED");
  });

  it("sends notification even when all orders are escalated (bypasses today-suppression)", async () => {
    // Both orders were notified today BUT are also escalated (edge case: clock skew or test)
    // In practice escalated means 2+ days ago, so this tests that escalated always wins
    const escalated = makeOrder({
      extensivOrderId: 3001,
      referenceNum: "REF-ESC-TODAY",
      lastOverdueAlertSentAt: daysAgo(ESCALATION_THRESHOLD_DAYS),
    });
    mockGetOverdue.mockResolvedValueOnce([escalated]);
    mockNotify.mockResolvedValueOnce(true);

    const result = await sendOverdueAlertNow();

    expect(result.escalatedCount).toBe(1);
    expect(result.overdueCount).toBe(1);
    expect(mockNotify).toHaveBeenCalledOnce();
  });

  it("includes escalation header in notification when escalated orders are present", async () => {
    const escalated = makeOrder({
      extensivOrderId: 4001,
      referenceNum: "REF-ESC",
      lastOverdueAlertSentAt: daysAgo(3),
    });
    mockGetOverdue.mockResolvedValueOnce([escalated]);
    mockNotify.mockResolvedValueOnce(true);

    await sendOverdueAlertNow();

    const content: string = mockNotify.mock.calls[0][0].content;
    // Should include the escalation callout block
    expect(content).toMatch(/immediate action required/i);
  });

  it("includes escalated count in notification title when escalated orders are present", async () => {
    const escalated = makeOrder({
      extensivOrderId: 4002,
      referenceNum: "REF-ESC-TITLE",
      lastOverdueAlertSentAt: daysAgo(4),
    });
    mockGetOverdue.mockResolvedValueOnce([escalated]);
    mockNotify.mockResolvedValueOnce(true);

    await sendOverdueAlertNow();

    const title: string = mockNotify.mock.calls[0][0].title;
    expect(title).toContain("Escalated");
  });

  it("correctly separates escalated, fresh, and suppressed orders in a mixed batch", async () => {
    const escalated = makeOrder({ extensivOrderId: 5001, referenceNum: "REF-ESC", lastOverdueAlertSentAt: daysAgo(3) });
    const fresh = makeOrder({ extensivOrderId: 5002, referenceNum: "REF-FRESH", lastOverdueAlertSentAt: null });
    const suppressed = makeOrder({ extensivOrderId: 5003, referenceNum: "REF-SUPP", lastOverdueAlertSentAt: new Date() });
    mockGetOverdue.mockResolvedValueOnce([escalated, fresh, suppressed]);
    mockNotify.mockResolvedValueOnce(true);

    const result = await sendOverdueAlertNow();

    expect(result.escalatedCount).toBe(1);
    expect(result.overdueCount).toBe(2); // escalated + fresh
    expect(result.suppressedCount).toBe(1);

    const content: string = mockNotify.mock.calls[0][0].content;
    expect(content).toContain("REF-ESC");
    expect(content).toContain("REF-FRESH");
    expect(content).not.toContain("REF-SUPP");
  });

  // ── Error paths ────────────────────────────────────────────────────────────

  it("returns success=false when the DB query throws", async () => {
    mockGetOverdue.mockRejectedValueOnce(new Error("DB connection lost"));

    const result = await sendOverdueAlertNow();

    expect(result.success).toBe(false);
    expect(result.overdueCount).toBe(0);
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("returns success=false when the notification service returns false", async () => {
    mockGetOverdue.mockResolvedValueOnce([makeOrder()]);
    mockNotify.mockResolvedValueOnce(false);

    const result = await sendOverdueAlertNow();

    expect(result.success).toBe(false);
    expect(result.overdueCount).toBe(1);
  });

  // ── Content ────────────────────────────────────────────────────────────────

  it("includes all non-suppressed orders in the notification body", async () => {
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

  it("notification title includes the overdue order count", async () => {
    const orders = [makeOrder(), makeOrder({ extensivOrderId: 9999, referenceNum: "REF-999" })];
    mockGetOverdue.mockResolvedValueOnce(orders);
    mockNotify.mockResolvedValueOnce(true);

    await sendOverdueAlertNow();

    const title: string = mockNotify.mock.calls[0][0].title;
    expect(title).toContain("2");
  });
});
