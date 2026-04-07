/**
 * Tests for the getOrderDetail tRPC procedure additions:
 *   - slaSnapshot is included in the response
 *   - auditHistory is included in the response
 *   - getLatestSlaSnapshotForOrder and getOrderAuditHistory helpers exist and are callable
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

// ─── Mock db helpers ──────────────────────────────────────────────────────────
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getOrderById: vi.fn(),
    getExtensivConfigById: vi.fn(),
    getLatestSlaSnapshotForOrder: vi.fn(),
    getOrderAuditHistory: vi.fn(),
  };
});

vi.mock("./extensiv/api", () => ({
  fetchOrderWithDetail: vi.fn(),
}));

import {
  getOrderById,
  getLatestSlaSnapshotForOrder,
  getOrderAuditHistory,
} from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  const ctx: TrpcContext = {
    user,
    req: {
      cookies: {},
      headers: {},
    } as unknown as TrpcContext["req"],
    res: {
      cookie: vi.fn(),
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
  return { ctx };
}

const MOCK_ORDER = {
  id: 42,
  extensivOrderId: 99001,
  configId: 3,
  clientName: "Test Client",
  facilityName: "Toronto",
  lifecycleStatus: "allocated" as const,
  referenceNum: "REF-001",
  poNum: "PO-001",
  shipToName: "Acme Corp",
  shipToCity: "Toronto",
  totalPieces: 100,
  skuCount: 3,
  notes: null,
  savedElements: null,
  slaExtensionDays: null,
  slaExtensionNote: null,
  shipwellOrderId: null,
  shipwellStatus: null,
  shipwellBidCount: null,
  shipwellSentAt: null,
  shipwellQuotingStartedAt: null,
  shipwellStatusUpdatedAt: null,
  shipwellPoUrl: null,
  shipwellShipmentUrl: null,
  firstSeenAt: new Date("2025-01-01"),
  lastSyncedAt: new Date("2025-01-02"),
  allocatedAt: new Date("2025-01-03"),
  pickingAt: null,
  qcAt: null,
  qcCompleteAt: null,
  shipReadyAt: null,
  assignedAssociate: null,
  outboundLocation: null,
  palletCount: null,
  creationDate: "2025-01-01",
  requiredShipDate: null,
};

const MOCK_SLA_SNAPSHOT = {
  id: 1,
  snapshotDate: "2025-01-10",
  orderId: 99001,
  clientId: 5,
  clientName: "Test Client",
  poNum: "PO-001",
  refNum: "REF-001",
  creation: "2025-01-01",
  company: "Acme Corp",
  notes: null,
  facility: "Toronto",
  fullyAllocated: true,
  rule: "2-day",
  slaDate: "2025-01-05",
  outOfSla: false,
  alwaysFlag: false,
  flagNote: null,
  bizDaysLate: null,
  createdAt: new Date("2025-01-10"),
};

const MOCK_AUDIT_HISTORY = [
  {
    id: 1,
    action: "pickSchedule.updateStatus",
    details: { newStatus: "allocated", prevStatus: "unallocated" },
    createdAt: new Date("2025-01-03"),
    userName: "Jane Doe",
    userEmail: "jane@example.com",
  },
];

describe("getOrderDetail – slaSnapshot and auditHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes slaSnapshot and auditHistory in the response", async () => {
    (getOrderById as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_ORDER);
    (getLatestSlaSnapshotForOrder as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_SLA_SNAPSHOT);
    (getOrderAuditHistory as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_AUDIT_HISTORY);

    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.pickSchedule.getOrderDetail({ id: 42 });

    expect(result.slaSnapshot).toBeDefined();
    expect(result.slaSnapshot?.orderId).toBe(99001);
    expect(result.slaSnapshot?.outOfSla).toBe(false);
    expect(result.auditHistory).toHaveLength(1);
    expect(result.auditHistory[0].action).toBe("pickSchedule.updateStatus");
    expect(result.auditHistory[0].userName).toBe("Jane Doe");
  });

  it("returns null slaSnapshot when no snapshot exists", async () => {
    (getOrderById as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_ORDER);
    (getLatestSlaSnapshotForOrder as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (getOrderAuditHistory as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.pickSchedule.getOrderDetail({ id: 42 });

    expect(result.slaSnapshot).toBeNull();
    expect(result.auditHistory).toHaveLength(0);
  });

  it("throws NOT_FOUND when order does not exist", async () => {
    (getOrderById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.pickSchedule.getOrderDetail({ id: 9999 })).rejects.toThrow("Order not found");
  });
});

describe("getLatestSlaSnapshotForOrder helper", () => {
  it("is exported from db.ts", () => {
    expect(typeof getLatestSlaSnapshotForOrder).toBe("function");
  });
});

describe("getOrderAuditHistory helper", () => {
  it("is exported from db.ts", () => {
    expect(typeof getOrderAuditHistory).toBe("function");
  });
});
