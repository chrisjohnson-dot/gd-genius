/**
 * Tests for the shipwell.sendOrder tRPC procedure:
 *   - Only ship_ready orders can be sent
 *   - Orders already sent (shipwellOrderId set) are rejected with CONFLICT
 *   - Orders not in ship_ready status are rejected with BAD_REQUEST
 *   - Missing Shipwell config returns NOT_FOUND
 *   - Successful send returns shipwellOrderId and poUrl
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

// ─── Mock dependencies ────────────────────────────────────────────────────────
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getTrackedOrders: vi.fn(),
    getShipwellConfig: vi.fn(),
    markOrderSentToShipwell: vi.fn(),
    createAuditLog: vi.fn(),
  };
});

vi.mock("./shipwell/api", () => ({
  createShipwellClient: vi.fn(() => ({
    createPurchaseOrder: vi.fn(),
    getPoUrl: vi.fn((id: string) => `https://app.shipwell.com/po/${id}`),
  })),
}));

import { getTrackedOrders, getShipwellConfig, markOrderSentToShipwell } from "./db";
import { createShipwellClient } from "./shipwell/api";
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
    req: { cookies: {}, headers: {} } as unknown as TrpcContext["req"],
    res: {
      cookie: vi.fn(),
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
  return { ctx };
}

const MOCK_CONFIG = {
  id: 1,
  email: "test@shipwell.com",
  password: "secret",
  environment: "sandbox",
};

const makeOrder = (overrides: Record<string, unknown> = {}) => ({
  id: 10,
  extensivOrderId: 3214839,
  configId: 3,
  clientName: "Test Client",
  facilityName: "Toronto",
  lifecycleStatus: "ship_ready",
  referenceNum: "REF-001",
  poNum: "PO-001",
  shipToName: "Acme Corp",
  shipToCity: "Toronto",
  shipwellOrderId: null,
  shipwellStatus: null,
  shipwellBidCount: null,
  shipwellSentAt: null,
  shipwellQuotingStartedAt: null,
  shipwellStatusUpdatedAt: null,
  shipwellPoUrl: null,
  shipwellShipmentUrl: null,
  notes: null,
  ...overrides,
});

describe("shipwell.sendOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws NOT_FOUND when Shipwell config is missing", async () => {
    (getShipwellConfig as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (getTrackedOrders as ReturnType<typeof vi.fn>).mockResolvedValue([makeOrder()]);

    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.shipwell.sendOrder({ extensivOrderId: 3214839 })
    ).rejects.toThrow("No Shipwell config found");
  });

  it("throws NOT_FOUND when order is not in tracking table", async () => {
    (getShipwellConfig as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_CONFIG);
    (getTrackedOrders as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.shipwell.sendOrder({ extensivOrderId: 9999999 })
    ).rejects.toThrow("Order not found");
  });

  it("throws BAD_REQUEST when order is not ship_ready", async () => {
    (getShipwellConfig as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_CONFIG);
    (getTrackedOrders as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeOrder({ lifecycleStatus: "allocated" }),
    ]);

    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.shipwell.sendOrder({ extensivOrderId: 3214839 })
    ).rejects.toThrow("Only Ship Ready orders can be sent to Shipwell");
  });

  it("throws CONFLICT when order already has a Shipwell PO", async () => {
    (getShipwellConfig as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_CONFIG);
    (getTrackedOrders as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeOrder({ shipwellOrderId: "existing-po-id" }),
    ]);

    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.shipwell.sendOrder({ extensivOrderId: 3214839 })
    ).rejects.toThrow("Order already sent to Shipwell");
  });

  it("creates a PO and returns shipwellOrderId and poUrl on success", async () => {
    (getShipwellConfig as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_CONFIG);
    (getTrackedOrders as ReturnType<typeof vi.fn>).mockResolvedValue([makeOrder()]);
    (markOrderSentToShipwell as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const mockClient = {
      createPurchaseOrder: vi.fn().mockResolvedValue({ id: "new-po-uuid" }),
      getPoUrl: vi.fn((id: string) => `https://app.shipwell.com/po/${id}`),
    };
    (createShipwellClient as ReturnType<typeof vi.fn>).mockReturnValue(mockClient);

    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.shipwell.sendOrder({ extensivOrderId: 3214839 });

    expect(result.success).toBe(true);
    expect(result.shipwellOrderId).toBe("new-po-uuid");
    expect(result.poUrl).toBe("https://app.shipwell.com/po/new-po-uuid");
    expect(markOrderSentToShipwell).toHaveBeenCalledWith(
      3214839,
      "new-po-uuid",
      "https://app.shipwell.com/po/new-po-uuid"
    );
  });
});
